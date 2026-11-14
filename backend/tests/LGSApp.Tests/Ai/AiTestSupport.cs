using System.Net;
using System.Text;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Ai;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Time.Testing;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Ai;

public sealed record CapturedRequest(HttpMethod Method, Uri Uri, IReadOnlyDictionary<string, string> Headers, string Body, DateTimeOffset At);

public sealed class StubHandler(FakeTimeProvider clock) : HttpMessageHandler
{
    private readonly Queue<Func<CancellationToken, Task<HttpResponseMessage>>> responses = new();

    public List<CapturedRequest> Requests { get; } = [];

    public StubHandler Enqueue(Func<CancellationToken, Task<HttpResponseMessage>> responder)
    {
        responses.Enqueue(responder);
        return this;
    }

    public StubHandler EnqueueJson(HttpStatusCode status, string json, TimeSpan? retryAfter = null) =>
        Enqueue(_ =>
        {
            var message = new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
            if (retryAfter is { } delta)
            {
                message.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(delta);
            }

            return Task.FromResult(message);
        });

    public StubHandler EnqueueHang() =>
        Enqueue(async token =>
        {
            await Task.Delay(Timeout.Infinite, token);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });

    public StubHandler EnqueueThrow(Exception exception) =>
        Enqueue(_ => throw exception);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var headers = request.Headers.ToDictionary(h => h.Key, h => string.Join(",", h.Value), StringComparer.OrdinalIgnoreCase);
        var body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
        Requests.Add(new CapturedRequest(request.Method, request.RequestUri!, headers, body, clock.GetUtcNow()));

        if (responses.Count == 0)
        {
            throw new InvalidOperationException("Sıradaki sahte yanıt tanımlanmamış.");
        }

        return await responses.Dequeue()(cancellationToken);
    }
}

public sealed class FixedJitter(double value) : IGeminiJitter
{
    public double Next() => value;
}

public sealed class CapturingLoggerProvider : ILoggerProvider
{
    public List<string> Messages { get; } = [];

    public ILogger CreateLogger(string categoryName) => new CapturingLogger(Messages);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(List<string> messages) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            lock (messages)
            {
                messages.Add(formatter(state, exception) + (exception is null ? string.Empty : " | " + exception));
            }
        }
    }
}

public static class AiTestData
{
    public const string QuestionKey = "TEST-QUESTION-KEY-123";
    public const string SolutionKey = "TEST-SOLUTION-KEY-456";

    public static AiOptions GeminiOptions() => new()
    {
        Provider = AiProvider.Gemini,
        Gemini = new GeminiConnectionOptions { BaseUrl = "https://example.test", ApiVersion = "v1beta", QuestionApiKey = QuestionKey, SolutionApiKey = SolutionKey },
        Question = new AiQuestionOptions { Model = "gemini-3.8-flash" },
        Solution = new AiSolutionOptions { Model = "gemini-3.8-flash" }
    };

    public static GeminiRestClient CreateClient(StubHandler handler, FakeTimeProvider clock, AiOptions? options = null, ILogger<GeminiRestClient>? logger = null, double jitter = 0)
    {
        var http = new HttpClient(handler) { Timeout = System.Threading.Timeout.InfiniteTimeSpan };
        return new GeminiRestClient(
            http,
            Options.Create(options ?? GeminiOptions()),
            clock,
            new FixedJitter(jitter),
            logger ?? Microsoft.Extensions.Logging.Abstractions.NullLogger<GeminiRestClient>.Instance);
    }

    public static GeminiRequest Request(
        int maxAttempts = 3,
        double timeoutSeconds = 30,
        double max429Seconds = 40,
        double budgetSeconds = 240,
        double? fallbackSeconds = null,
        IReadOnlyList<GeminiPart>? parts = null) =>
        new(
            "gemini-3.8-flash",
            "Sistem yönergesi",
            parts ?? [GeminiPart.Text("Merhaba")],
            AiSchemas.Question(),
            2048,
            "low",
            TimeSpan.FromSeconds(timeoutSeconds),
            maxAttempts,
            TimeSpan.FromSeconds(max429Seconds),
            TimeSpan.FromSeconds(budgetSeconds),
            fallbackSeconds is { } f ? TimeSpan.FromSeconds(f) : null);

    public static string SuccessBody(string payload = "{\"ok\":true}", string finish = "STOP", int input = 100, int output = 50, int thoughts = 20)
    {
        var text = System.Text.Json.JsonSerializer.Serialize(payload);
        return $$"""
            {"candidates":[{"content":{"role":"model","parts":[{"text":{{text}}}]},"finishReason":"{{finish}}"}],
             "usageMetadata":{"promptTokenCount":{{input}},"candidatesTokenCount":{{output}},"thoughtsTokenCount":{{thoughts}}},
             "modelVersion":"gemini-3.8-flash-001","responseId":"abc"}
            """;
    }

    public static string RateLimitBody(string retryDelay, string? quotaId = null)
    {
        var quota = quotaId is null
            ? string.Empty
            : ",{\"@type\":\"type.googleapis.com/google.rpc.QuotaFailure\",\"violations\":[{\"quotaId\":\"" + quotaId + "\"}]}";
        return "{\"error\":{\"code\":429,\"message\":\"Resource exhausted\",\"status\":\"RESOURCE_EXHAUSTED\",\"details\":["
            + "{\"@type\":\"type.googleapis.com/google.rpc.RetryInfo\",\"retryDelay\":\"" + retryDelay + "\"}" + quota + "]}}";
    }

    public static async Task<T> RunAsync<T>(Task<T> task, FakeTimeProvider clock, int stepMilliseconds = 250)
    {
        for (var i = 0; i < 4000 && !task.IsCompleted; i++)
        {
            clock.Advance(TimeSpan.FromMilliseconds(stepMilliseconds));
            await Task.Delay(1);
        }

        return await task.WaitAsync(TimeSpan.FromSeconds(10));
    }
}
