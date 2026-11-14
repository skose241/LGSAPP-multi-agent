using System.Net.Http.Headers;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Ai;

public interface IGeminiClient
{
    Task<GeminiCallResult> GenerateAsync(GeminiRequest request, AiKeyPurpose purpose, CancellationToken cancellationToken);
}

public interface IGeminiJitter
{
    double Next();
}

public sealed class RandomGeminiJitter : IGeminiJitter
{
    public double Next() => Random.Shared.NextDouble();
}

public sealed class GeminiRestClient(
    HttpClient http,
    IOptions<AiOptions> options,
    TimeProvider timeProvider,
    IGeminiJitter jitter,
    ILogger<GeminiRestClient> logger) : IGeminiClient
{
    public const string ApiKeyHeader = "x-goog-api-key";
    public const string NotConfiguredMessage = "Yapay zekâ yapılandırılmadı.";

    private static readonly JsonSerializerOptions BodyOptions = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public async Task<GeminiCallResult> GenerateAsync(GeminiRequest request, AiKeyPurpose purpose, CancellationToken cancellationToken)
    {
        var gemini = options.Value.Gemini;
        var apiKey = purpose == AiKeyPurpose.Question ? gemini.QuestionApiKey : gemini.SolutionApiKey;
        if (string.IsNullOrEmpty(apiKey))
        {
            return GeminiCallResult.Failure(AiErrorKind.NotConfigured, NotConfiguredMessage);
        }

        var uri = BuildUri(gemini, request.Model);
        var body = BuildBody(request);
        var started = timeProvider.GetTimestamp();
        var maxAttempts = Math.Max(1, request.MaxAttempts);
        GeminiCallResult? last = null;
        var attempts = 0;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var remaining = request.TotalBudget - timeProvider.GetElapsedTime(started);
            if (remaining <= TimeSpan.Zero)
            {
                last ??= GeminiCallResult.Failure(AiErrorKind.Timeout, "Toplam süre bütçesi doldu.", attempts, ElapsedMs(started));
                break;
            }

            attempts = attempt;
            var attemptTimeout = request.Timeout < remaining ? request.Timeout : remaining;
            var parsed = await SendOnceAsync(uri, body, apiKey, attemptTimeout, cancellationToken);
            var status = parsed.Status;
            var response = parsed.Response;

            if (response.Succeeded)
            {
                return new GeminiCallResult(
                    true,
                    response.Json,
                    response.FinishReason,
                    response.InputTokens,
                    response.OutputTokens,
                    response.ThinkingTokens,
                    status,
                    AiErrorKind.None,
                    null,
                    null,
                    attempt,
                    ElapsedMs(started),
                    response.ModelVersion,
                    response.ResponseId);
            }

            last = GeminiCallResult.Failure(
                response.ErrorKind,
                Scrub(response.ErrorMessage, apiKey),
                attempt,
                ElapsedMs(started),
                status,
                response.RetryDelay,
                response.FinishReason,
                response.InputTokens,
                response.OutputTokens,
                response.ThinkingTokens,
                response.ModelVersion,
                response.ResponseId);

            logger.LogWarning(
                "Gemini çağrısı başarısız. Model: {Model}, Deneme: {Attempt}/{MaxAttempts}, Durum: {Status}, Tür: {Kind}",
                request.Model,
                attempt,
                maxAttempts,
                status,
                response.ErrorKind);

            var decision = GeminiRetryPolicy.Decide(
                response.ErrorKind,
                response.RetryDelay,
                attempt,
                maxAttempts,
                request.Max429Wait,
                request.RateLimitFallbackWait,
                request.TotalBudget - timeProvider.GetElapsedTime(started),
                jitter.Next());

            if (!decision.Retry)
            {
                break;
            }

            await Task.Delay(decision.Delay, timeProvider, cancellationToken);
        }

        return last ?? GeminiCallResult.Failure(AiErrorKind.Timeout, "Çağrı yapılamadı.", attempts, ElapsedMs(started));
    }

    public static Uri BuildUri(GeminiConnectionOptions gemini, string model) =>
        new($"{gemini.BaseUrl.TrimEnd('/')}/{gemini.ApiVersion}/models/{Uri.EscapeDataString(model)}:generateContent", UriKind.Absolute);

    public static string BuildBody(GeminiRequest request)
    {
        var parts = new JsonArray();
        foreach (var part in request.Parts)
        {
            switch (part)
            {
                case GeminiTextPart text:
                    parts.Add(new JsonObject { ["text"] = text.Value });
                    break;
                case GeminiImagePart image:
                    parts.Add(new JsonObject
                    {
                        ["inlineData"] = new JsonObject
                        {
                            ["mimeType"] = image.MimeType,
                            ["data"] = Convert.ToBase64String(image.Bytes)
                        }
                    });
                    break;
            }
        }

        var generationConfig = new JsonObject
        {
            ["responseMimeType"] = "application/json",
            ["responseJsonSchema"] = request.ResponseJsonSchema.DeepClone(),
            ["maxOutputTokens"] = request.MaxOutputTokens
        };

        if (!string.IsNullOrWhiteSpace(request.ThinkingLevel))
        {
            generationConfig["thinkingConfig"] = new JsonObject { ["thinkingLevel"] = request.ThinkingLevel };
        }

        var root = new JsonObject
        {
            ["systemInstruction"] = new JsonObject { ["parts"] = new JsonArray(new JsonObject { ["text"] = request.SystemInstruction }) },
            ["contents"] = new JsonArray(new JsonObject { ["role"] = "user", ["parts"] = parts }),
            ["generationConfig"] = generationConfig
        };

        return root.ToJsonString(BodyOptions);
    }

    private async Task<(GeminiParsedResponse Response, int? Status)> SendOnceAsync(
        Uri uri,
        string body,
        string apiKey,
        TimeSpan timeout,
        CancellationToken cancellationToken)
    {
        using var timeoutSource = new CancellationTokenSource(timeout < TimeSpan.FromMilliseconds(1) ? TimeSpan.FromMilliseconds(1) : timeout, timeProvider);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutSource.Token);

        try
        {
            using var message = new HttpRequestMessage(HttpMethod.Post, uri)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };
            message.Headers.TryAddWithoutValidation(ApiKeyHeader, apiKey);

            using var response = await http.SendAsync(message, HttpCompletionOption.ResponseContentRead, linked.Token);
            var text = await response.Content.ReadAsStringAsync(linked.Token);
            var status = (int)response.StatusCode;
            return (GeminiResponseParser.Parse(status, text, ReadRetryAfter(response.Headers)), status);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            return (Fail(AiErrorKind.Timeout, "Gemini yanıtı zaman aşımına uğradı."), null);
        }
        catch (HttpRequestException ex)
        {
            return (Fail(AiErrorKind.Unavailable, $"Gemini'ye bağlanılamadı ({ex.HttpRequestError})."), null);
        }
    }

    private TimeSpan? ReadRetryAfter(HttpResponseHeaders headers)
    {
        var value = headers.RetryAfter;
        if (value is null)
        {
            return null;
        }

        if (value.Delta is { } delta)
        {
            return delta;
        }

        if (value.Date is { } date)
        {
            var wait = date - timeProvider.GetUtcNow();
            return wait > TimeSpan.Zero ? wait : TimeSpan.Zero;
        }

        return null;
    }

    private static GeminiParsedResponse Fail(AiErrorKind kind, string message) =>
        new(false, kind, null, null, null, null, null, null, null, message, null);

    private static string? Scrub(string? message, string apiKey) =>
        message is null ? null : message.Replace(apiKey, "***", StringComparison.Ordinal);

    private int ElapsedMs(long started) => (int)Math.Min(int.MaxValue, timeProvider.GetElapsedTime(started).TotalMilliseconds);
}
