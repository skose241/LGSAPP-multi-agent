using System.Net;
using System.Text.Json;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Ai;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Time.Testing;

namespace LGSApp.Tests.Ai;

public class GeminiRestClientTests
{
    private static (StubHandler Handler, FakeTimeProvider Clock) Create()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 14, 12, 0, 0, TimeSpan.Zero));
        return (new StubHandler(clock), clock);
    }

    [Fact]
    public async Task Request_has_expected_shape_and_key_only_in_header()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody());
        var client = AiTestData.CreateClient(handler, clock);
        var image = new byte[] { 1, 2, 3, 4 };
        var request = AiTestData.Request(parts: [GeminiPart.Text("Soru metni"), GeminiPart.InlineImage(image, "image/jpeg")]);

        var result = await client.GenerateAsync(request, AiKeyPurpose.Solution, CancellationToken.None);

        Assert.True(result.Succeeded);
        var sent = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Post, sent.Method);
        Assert.Equal("https://example.test/v1beta/models/gemini-3.8-flash:generateContent", sent.Uri.AbsoluteUri);
        Assert.DoesNotContain(AiTestData.SolutionKey, sent.Uri.AbsoluteUri);
        Assert.DoesNotContain("key=", sent.Uri.Query);
        Assert.Equal(AiTestData.SolutionKey, sent.Headers["x-goog-api-key"]);
        Assert.DoesNotContain(AiTestData.SolutionKey, sent.Body);

        using var body = JsonDocument.Parse(sent.Body);
        var root = body.RootElement;
        Assert.Equal("Sistem yönergesi", root.GetProperty("systemInstruction").GetProperty("parts")[0].GetProperty("text").GetString());
        var config = root.GetProperty("generationConfig");
        Assert.Equal("application/json", config.GetProperty("responseMimeType").GetString());
        Assert.Equal("object", config.GetProperty("responseJsonSchema").GetProperty("type").GetString());
        Assert.Equal(2048, config.GetProperty("maxOutputTokens").GetInt32());
        Assert.Equal("low", config.GetProperty("thinkingConfig").GetProperty("thinkingLevel").GetString());
        Assert.False(config.TryGetProperty("temperature", out _));
        var parts = root.GetProperty("contents")[0].GetProperty("parts");
        Assert.Equal("Soru metni", parts[0].GetProperty("text").GetString());
        Assert.Equal("image/jpeg", parts[1].GetProperty("inlineData").GetProperty("mimeType").GetString());
        Assert.Equal(Convert.ToBase64String(image), parts[1].GetProperty("inlineData").GetProperty("data").GetString());
    }

    [Fact]
    public async Task Question_purpose_uses_question_key()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody());
        var client = AiTestData.CreateClient(handler, clock);

        await client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None);

        Assert.Equal(AiTestData.QuestionKey, Assert.Single(handler.Requests).Headers["x-goog-api-key"]);
    }

    [Fact]
    public async Task Thinking_level_is_omitted_when_empty()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody());
        var client = AiTestData.CreateClient(handler, clock);
        var request = AiTestData.Request() with { ThinkingLevel = null };

        await client.GenerateAsync(request, AiKeyPurpose.Question, CancellationToken.None);

        using var body = JsonDocument.Parse(handler.Requests[0].Body);
        Assert.False(body.RootElement.GetProperty("generationConfig").TryGetProperty("thinkingConfig", out _));
    }

    [Fact]
    public async Task Success_returns_json_usage_and_metadata()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody("{\"a\":1}", input: 321, output: 45, thoughts: 67));
        var client = AiTestData.CreateClient(handler, clock);

        var result = await client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal("{\"a\":1}", result.Json);
        Assert.Equal(321, result.InputTokens);
        Assert.Equal(45, result.OutputTokens);
        Assert.Equal(67, result.ThinkingTokens);
        Assert.Equal(200, result.HttpStatus);
        Assert.Equal(1, result.Attempts);
        Assert.Equal("gemini-3.8-flash-001", result.ModelVersion);
        Assert.Equal(AiErrorKind.None, result.ErrorKind);
    }

    [Fact]
    public async Task Missing_key_returns_not_configured_without_http_call()
    {
        var (handler, clock) = Create();
        var options = AiTestData.GeminiOptions();
        options.Gemini.SolutionApiKey = string.Empty;
        var client = AiTestData.CreateClient(handler, clock, options);

        var result = await client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Solution, CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal(AiErrorKind.NotConfigured, result.ErrorKind);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task Rate_limit_with_short_retry_info_waits_and_succeeds()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.TooManyRequests, AiTestData.RateLimitBody("7s"));
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody());
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.True(result.Succeeded);
        Assert.Equal(2, result.Attempts);
        var gap = handler.Requests[1].At - handler.Requests[0].At;
        Assert.InRange(gap.TotalSeconds, 7.7, 9.2);
    }

    [Fact]
    public async Task Rate_limit_with_long_retry_info_does_not_wait()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.TooManyRequests, AiTestData.RateLimitBody("90s"));
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.False(result.Succeeded);
        Assert.Equal(AiErrorKind.RateLimited, result.ErrorKind);
        Assert.Equal(429, result.HttpStatus);
        Assert.Equal(TimeSpan.FromSeconds(90), result.RetryAfter);
        Assert.Equal(1, result.Attempts);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task Per_day_quota_is_not_retried()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.TooManyRequests, AiTestData.RateLimitBody("5s", "GenerateRequestsPerDayPerProjectPerModel"));
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.Equal(AiErrorKind.QuotaExhausted, result.ErrorKind);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task Rate_limit_without_delay_uses_fallback_when_given()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.TooManyRequests, "{\"error\":{\"code\":429,\"message\":\"x\",\"status\":\"RESOURCE_EXHAUSTED\"}}");
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody());
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(fallbackSeconds: 35), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.True(result.Succeeded);
        Assert.InRange((handler.Requests[1].At - handler.Requests[0].At).TotalSeconds, 38.5, 40.5);
    }

    [Fact]
    public async Task Rate_limit_without_delay_and_without_fallback_stops()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.TooManyRequests, "{\"error\":{\"code\":429,\"message\":\"x\",\"status\":\"RESOURCE_EXHAUSTED\"}}");
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.Equal(AiErrorKind.RateLimited, result.ErrorKind);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task Retry_after_header_is_used_when_body_has_no_retry_info()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.TooManyRequests, "{\"error\":{\"code\":429,\"message\":\"x\",\"status\":\"RESOURCE_EXHAUSTED\"}}", TimeSpan.FromSeconds(10));
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody());
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.True(result.Succeeded);
        Assert.InRange((handler.Requests[1].At - handler.Requests[0].At).TotalSeconds, 11, 13);
    }

    [Fact]
    public async Task Service_unavailable_three_times_backs_off_two_then_six_seconds()
    {
        var (handler, clock) = Create();
        for (var i = 0; i < 3; i++)
        {
            handler.EnqueueJson(HttpStatusCode.ServiceUnavailable, "{\"error\":{\"code\":503,\"message\":\"overloaded\",\"status\":\"UNAVAILABLE\"}}");
        }

        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.False(result.Succeeded);
        Assert.Equal(AiErrorKind.Unavailable, result.ErrorKind);
        Assert.Equal(503, result.HttpStatus);
        Assert.Equal(3, result.Attempts);
        Assert.Equal(3, handler.Requests.Count);
        Assert.InRange((handler.Requests[1].At - handler.Requests[0].At).TotalSeconds, 2, 3.2);
        Assert.InRange((handler.Requests[2].At - handler.Requests[1].At).TotalSeconds, 6, 7.2);
    }

    [Fact]
    public async Task Service_unavailable_then_success()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.ServiceUnavailable, "{\"error\":{\"code\":503,\"message\":\"overloaded\"}}");
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody());
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.True(result.Succeeded);
        Assert.Equal(2, result.Attempts);
    }

    [Fact]
    public async Task Network_error_is_retried_as_unavailable()
    {
        var (handler, clock) = Create();
        handler.EnqueueThrow(new HttpRequestException("bağlantı koptu"));
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody());
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.True(result.Succeeded);
        Assert.Equal(2, result.Attempts);
    }

    [Fact]
    public async Task Attempt_timeout_is_reported_as_timeout_after_attempts()
    {
        var (handler, clock) = Create();
        handler.EnqueueHang().EnqueueHang();
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(
            client.GenerateAsync(AiTestData.Request(maxAttempts: 2, timeoutSeconds: 5), AiKeyPurpose.Question, CancellationToken.None),
            clock);

        Assert.False(result.Succeeded);
        Assert.Equal(AiErrorKind.Timeout, result.ErrorKind);
        Assert.Equal(2, result.Attempts);
        Assert.InRange((handler.Requests[1].At - handler.Requests[0].At).TotalSeconds, 7, 8.5);
    }

    [Fact]
    public async Task Timeout_then_success()
    {
        var (handler, clock) = Create();
        handler.EnqueueHang();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody());
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(
            client.GenerateAsync(AiTestData.Request(maxAttempts: 2, timeoutSeconds: 5), AiKeyPurpose.Question, CancellationToken.None),
            clock);

        Assert.True(result.Succeeded);
        Assert.Equal(2, result.Attempts);
    }

    [Fact]
    public async Task Total_budget_limits_the_whole_call()
    {
        var (handler, clock) = Create();
        handler.EnqueueHang().EnqueueHang().EnqueueHang();
        var client = AiTestData.CreateClient(handler, clock);
        var started = clock.GetUtcNow();

        var result = await AiTestData.RunAsync(
            client.GenerateAsync(AiTestData.Request(maxAttempts: 3, timeoutSeconds: 5, budgetSeconds: 10), AiKeyPurpose.Question, CancellationToken.None),
            clock);

        Assert.Equal(AiErrorKind.Timeout, result.ErrorKind);
        Assert.True(clock.GetUtcNow() - started <= TimeSpan.FromSeconds(10.5));
        Assert.True(result.Attempts <= 2);
    }

    [Fact]
    public async Task Caller_cancellation_propagates()
    {
        var (handler, clock) = Create();
        handler.EnqueueHang();
        var client = AiTestData.CreateClient(handler, clock);
        using var cts = new CancellationTokenSource();

        var task = client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, cts.Token);
        await cts.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task);
    }

    [Theory]
    [InlineData(401, AiErrorKind.AuthFailed)]
    [InlineData(403, AiErrorKind.AuthFailed)]
    [InlineData(400, AiErrorKind.InvalidRequest)]
    [InlineData(404, AiErrorKind.InvalidRequest)]
    public async Task Client_errors_are_not_retried(int status, AiErrorKind expected)
    {
        var (handler, clock) = Create();
        handler.EnqueueJson((HttpStatusCode)status, "{\"error\":{\"code\":" + status + ",\"message\":\"hata\"}}");
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.Equal(expected, result.ErrorKind);
        Assert.Equal(status, result.HttpStatus);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task Invalid_api_key_reported_as_400_is_auth_failure()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(
            HttpStatusCode.BadRequest,
            "{\"error\":{\"code\":400,\"message\":\"API key not valid.\",\"status\":\"INVALID_ARGUMENT\",\"details\":[{\"@type\":\"type.googleapis.com/google.rpc.ErrorInfo\",\"reason\":\"API_KEY_INVALID\"}]}}");
        var client = AiTestData.CreateClient(handler, clock);

        var result = await client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None);

        Assert.Equal(AiErrorKind.AuthFailed, result.ErrorKind);
    }

    [Theory]
    [InlineData("SAFETY", AiErrorKind.Blocked)]
    [InlineData("MAX_TOKENS", AiErrorKind.Truncated)]
    public async Task Finish_reasons_are_classified_and_not_retried(string finish, AiErrorKind expected)
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(finish: finish));
        var client = AiTestData.CreateClient(handler, clock);

        var result = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.Equal(expected, result.ErrorKind);
        Assert.Equal(finish, result.FinishReason);
        Assert.Equal(100, result.InputTokens);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task Broken_json_payload_is_invalid_output()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody("{bozuk"));
        var client = AiTestData.CreateClient(handler, clock);

        var result = await client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None);

        Assert.Equal(AiErrorKind.InvalidOutput, result.ErrorKind);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task Keys_never_reach_logs_or_error_messages()
    {
        var (handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.Forbidden, "{\"error\":{\"code\":403,\"message\":\"Anahtar " + AiTestData.QuestionKey + " reddedildi\"}}");
        handler.EnqueueJson(HttpStatusCode.ServiceUnavailable, "{\"error\":{\"code\":503,\"message\":\"" + AiTestData.QuestionKey + "\"}}");
        var provider = new CapturingLoggerProvider();
        using var factory = LoggerFactory.Create(b => b.SetMinimumLevel(LogLevel.Trace).AddProvider(provider));
        var client = AiTestData.CreateClient(handler, clock, logger: factory.CreateLogger<LGSApp.Infrastructure.Services.Ai.GeminiRestClient>());

        var first = await client.GenerateAsync(AiTestData.Request(), AiKeyPurpose.Question, CancellationToken.None);
        var second = await AiTestData.RunAsync(client.GenerateAsync(AiTestData.Request(maxAttempts: 1), AiKeyPurpose.Question, CancellationToken.None), clock);

        Assert.NotEmpty(provider.Messages);
        Assert.All(provider.Messages, m => Assert.DoesNotContain(AiTestData.QuestionKey, m));
        Assert.DoesNotContain(AiTestData.QuestionKey, first.ErrorMessage);
        Assert.DoesNotContain(AiTestData.QuestionKey, second.ErrorMessage);
        Assert.Contains("***", first.ErrorMessage);
    }
}
