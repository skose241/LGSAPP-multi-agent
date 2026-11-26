using System.Net;
using System.Text.Json;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Ai;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Ai;

public class GeminiQuestionGeneratorTests
{
    private static readonly DateTimeOffset Start = new(2026, 11, 14, 14, 30, 0, TimeSpan.Zero);

    private static (GeminiQuestionGenerator Generator, StubHandler Handler, FakeTimeProvider Clock) Create(AiOptions? options = null)
    {
        var clock = new FakeTimeProvider(Start);
        var handler = new StubHandler(clock);
        options ??= AiTestData.GeminiOptions();
        options.Pricing["gemini-3.8-flash"] = new AiPricingOptions { InputPerMTokUsd = 0.75m, OutputPerMTokUsd = 3.75m };
        var client = AiTestData.CreateClient(handler, clock, options);
        var generator = new GeminiQuestionGenerator(
            client, Options.Create(options), new AiCostCalculator(Options.Create(options), clock), new AiProviderGate(clock, Options.Create(options)), clock, NullLogger<GeminiQuestionGenerator>.Instance);
        return (generator, handler, clock);
    }

    private static QuestionGenerationRequest Request(int target = 3, DateTime? deadline = null, IReadOnlyList<string>? recent = null) =>
        new(7, "Matematik", 11, "Üslü Sayılar", 2, 1, recent ?? ["Önceki soru bir", "Önceki soru iki"], target, deadline);

    private static string Payload(string correct = "C", string topic = "Üslü Sayılar") =>
        JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["question"] = "2 üzeri 3 kaçtır?",
            ["optionA"] = "6",
            ["optionB"] = "8",
            ["optionC"] = "9",
            ["optionD"] = "12",
            ["correctOption"] = correct,
            ["explanation"] = new string('e', 70),
            ["topic"] = topic
        });

    [Fact]
    public async Task Request_body_has_schema_system_instruction_target_letter_and_recent_questions()
    {
        var (generator, handler, _) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload()));

        var result = await generator.GenerateAsync(Request(target: 3), CancellationToken.None);

        Assert.True(result.Succeeded);
        var sent = Assert.Single(handler.Requests);
        Assert.Equal(AiTestData.QuestionKey, sent.Headers["x-goog-api-key"]);
        Assert.DoesNotContain(AiTestData.SolutionKey, sent.Body);
        using var body = JsonDocument.Parse(sent.Body);
        var system = body.RootElement.GetProperty("systemInstruction").GetProperty("parts")[0].GetProperty("text").GetString()!;
        Assert.Contains("Matematik öğretmenisin", system);
        var prompt = body.RootElement.GetProperty("contents")[0].GetProperty("parts")[0].GetProperty("text").GetString()!;
        Assert.Contains("Doğru cevap C şıkkı olmalı.", prompt);
        Assert.Contains("1. Önceki soru bir", prompt);
        Assert.Contains("2. Önceki soru iki", prompt);
        var config = body.RootElement.GetProperty("generationConfig");
        Assert.Equal("application/json", config.GetProperty("responseMimeType").GetString());
        Assert.Equal("low", config.GetProperty("thinkingConfig").GetProperty("thinkingLevel").GetString());
        var schema = config.GetProperty("responseJsonSchema");
        Assert.True(schema.GetProperty("properties").TryGetProperty("correctOption", out _));
        Assert.False(schema.GetProperty("additionalProperties").GetBoolean());
    }

    [Fact]
    public async Task Request_body_contains_no_user_data()
    {
        var (generator, handler, _) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload()));

        await generator.GenerateAsync(Request(), CancellationToken.None);

        var body = Assert.Single(handler.Requests).Body;
        Assert.DoesNotContain("userId", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("yapay.zeka", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Success_maps_fields_tokens_cost_and_model_version()
    {
        var (generator, handler, _) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload("B"), input: 1000, output: 500, thoughts: 200));

        var result = await generator.GenerateAsync(Request(target: 2), CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal("2 üzeri 3 kaçtır?", result.Text);
        Assert.Equal("8", result.OptionB);
        Assert.Equal(2, result.CorrectOption);
        Assert.Equal("Üslü Sayılar", result.Topic);
        Assert.Equal(1000, result.InputTokens);
        Assert.Equal(500, result.OutputTokens);
        Assert.Equal(200, result.ThinkingTokens);
        Assert.Equal("gemini-3.8-flash-001", result.ModelVersion);
        Assert.Equal(1, result.AttemptCount);
        Assert.Equal(AiErrorKind.None, result.ErrorKind);
        Assert.Equal(Math.Round((1000 * 0.75m + 700 * 3.75m) / 1_000_000m, 6), result.CostUsd);
    }

    [Fact]
    public async Task Different_letter_than_target_is_accepted()
    {
        var (generator, handler, _) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload("A")));

        var result = await generator.GenerateAsync(Request(target: 4), CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal(1, result.CorrectOption);
    }

    [Theory]
    [InlineData("{\"question\":\"x\"}")]
    [InlineData("[]")]
    [InlineData("not json")]
    public async Task Malformed_payload_is_invalid_output(string payload)
    {
        var (generator, handler, _) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(payload));

        var result = await generator.GenerateAsync(Request(), CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal(AiErrorKind.InvalidOutput, result.ErrorKind);
        Assert.True(result.IsTransient);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, AiErrorKind.AuthFailed, false, "Yapay zekâ anahtarı geçersiz.")]
    [InlineData(HttpStatusCode.Forbidden, AiErrorKind.AuthFailed, false, "Yapay zekâ anahtarı geçersiz.")]
    [InlineData(HttpStatusCode.BadRequest, AiErrorKind.InvalidRequest, false, "Yapay zekâ isteği geçersiz.")]
    public async Task Http_errors_map_to_error_kind_and_transience(HttpStatusCode status, AiErrorKind kind, bool transient, string? message)
    {
        var (generator, handler, _) = Create();
        handler.EnqueueJson(status, "{\"error\":{\"code\":1,\"message\":\"boom\"}}");

        var result = await generator.GenerateAsync(Request(), CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal(kind, result.ErrorKind);
        Assert.Equal(transient, result.IsTransient);
        Assert.Equal((int)status, result.HttpStatus);
        if (message is not null)
        {
            Assert.Equal(message, result.Error);
        }
    }

    [Fact]
    public async Task Daily_quota_maps_to_quota_message_without_retry()
    {
        var (generator, handler, _) = Create();
        handler.EnqueueJson(HttpStatusCode.TooManyRequests, AiTestData.RateLimitBody("5s", "GenerateRequestsPerDayPerProjectPerModel"));

        var result = await generator.GenerateAsync(Request(), CancellationToken.None);

        Assert.Equal(AiErrorKind.QuotaExhausted, result.ErrorKind);
        Assert.Equal(SchedulerMessages.AiQuotaExhausted, result.Error);
        Assert.False(result.IsTransient);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task Rate_limit_without_delay_waits_thirty_five_seconds()
    {
        var (generator, handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.TooManyRequests, "{\"error\":{\"code\":429,\"message\":\"slow down\",\"status\":\"RESOURCE_EXHAUSTED\"}}");
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload()));

        var result = await AiTestData.RunAsync(generator.GenerateAsync(Request(), CancellationToken.None), clock);

        Assert.True(result.Succeeded);
        Assert.Equal(2, result.AttemptCount);
        Assert.Equal(2, handler.Requests.Count);
        Assert.True(handler.Requests[1].At - handler.Requests[0].At >= TimeSpan.FromSeconds(35));
    }

    [Fact]
    public async Task Server_errors_are_transient_unavailable()
    {
        var (generator, handler, clock) = Create();
        for (var i = 0; i < 3; i++)
        {
            handler.EnqueueJson(HttpStatusCode.ServiceUnavailable, "{}");
        }

        var result = await AiTestData.RunAsync(generator.GenerateAsync(Request(), CancellationToken.None), clock);

        Assert.Equal(AiErrorKind.Unavailable, result.ErrorKind);
        Assert.True(result.IsTransient);
        Assert.Equal(3, result.AttemptCount);
        Assert.Equal(SchedulerMessages.AiUnavailable, result.Error);
    }

    [Fact]
    public async Task Expired_deadline_fails_without_calling_provider()
    {
        var (generator, handler, _) = Create();

        var result = await generator.GenerateAsync(Request(deadline: Start.UtcDateTime.AddSeconds(2)), CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal(AiErrorKind.Timeout, result.ErrorKind);
        Assert.Equal(0, result.AttemptCount);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task Deadline_shrinks_the_total_budget()
    {
        var (generator, handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.TooManyRequests, "{\"error\":{\"code\":429,\"message\":\"slow\",\"status\":\"RESOURCE_EXHAUSTED\"}}");

        var result = await AiTestData.RunAsync(generator.GenerateAsync(Request(deadline: Start.UtcDateTime.AddSeconds(20)), CancellationToken.None), clock);

        Assert.False(result.Succeeded);
        Assert.Equal(AiErrorKind.RateLimited, result.ErrorKind);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public void Configured_follows_options()
    {
        var (generator, _, _) = Create();
        Assert.True(generator.IsConfigured);

        var options = AiTestData.GeminiOptions();
        options.Gemini.QuestionApiKey = string.Empty;
        var (unconfigured, _, _) = Create(options);
        Assert.False(unconfigured.IsConfigured);
    }
}
