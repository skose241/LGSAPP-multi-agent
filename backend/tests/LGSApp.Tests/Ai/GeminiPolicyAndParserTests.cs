using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Ai;
using Microsoft.Extensions.Options;

namespace LGSApp.Tests.Ai;

public class GeminiRetryPolicyTests
{
    private static RetryDecision Decide(
        AiErrorKind kind,
        TimeSpan? retryDelay = null,
        int attempt = 1,
        int maxAttempts = 3,
        double max429 = 40,
        double? fallback = null,
        double remaining = 240,
        double jitter = 0) =>
        GeminiRetryPolicy.Decide(
            kind,
            retryDelay,
            attempt,
            maxAttempts,
            TimeSpan.FromSeconds(max429),
            fallback is { } f ? TimeSpan.FromSeconds(f) : null,
            TimeSpan.FromSeconds(remaining),
            jitter);

    [Theory]
    [InlineData(AiErrorKind.QuotaExhausted)]
    [InlineData(AiErrorKind.AuthFailed)]
    [InlineData(AiErrorKind.InvalidRequest)]
    [InlineData(AiErrorKind.Blocked)]
    [InlineData(AiErrorKind.Truncated)]
    [InlineData(AiErrorKind.InvalidOutput)]
    [InlineData(AiErrorKind.NotConfigured)]
    [InlineData(AiErrorKind.Canceled)]
    [InlineData(AiErrorKind.Unreadable)]
    [InlineData(AiErrorKind.None)]
    public void Non_transient_kinds_never_retry(AiErrorKind kind)
    {
        Assert.False(Decide(kind, TimeSpan.FromSeconds(1)).Retry);
    }

    [Theory]
    [InlineData(AiErrorKind.Unavailable, 1, 2.0)]
    [InlineData(AiErrorKind.Unavailable, 2, 6.0)]
    [InlineData(AiErrorKind.Timeout, 1, 2.0)]
    [InlineData(AiErrorKind.Timeout, 2, 6.0)]
    public void Transient_kinds_use_two_then_six_second_backoff(AiErrorKind kind, int attempt, double expectedSeconds)
    {
        var decision = Decide(kind, attempt: attempt, jitter: 0);

        Assert.True(decision.Retry);
        Assert.Equal(TimeSpan.FromSeconds(expectedSeconds), decision.Delay);
    }

    [Fact]
    public void Backoff_jitter_adds_up_to_a_quarter()
    {
        Assert.Equal(TimeSpan.FromSeconds(2.5), Decide(AiErrorKind.Unavailable, jitter: 1).Delay);
    }

    [Fact]
    public void Attempts_are_capped()
    {
        Assert.False(Decide(AiErrorKind.Unavailable, attempt: 3, maxAttempts: 3).Retry);
        Assert.False(Decide(AiErrorKind.Unavailable, attempt: 1, maxAttempts: 1).Retry);
    }

    [Theory]
    [InlineData(0.0, 7.7)]
    [InlineData(1.0, 8.4)]
    public void Rate_limit_adds_ten_to_twenty_percent_jitter(double jitter, double expectedSeconds)
    {
        var decision = Decide(AiErrorKind.RateLimited, TimeSpan.FromSeconds(7), jitter: jitter);

        Assert.True(decision.Retry);
        Assert.Equal(expectedSeconds, decision.Delay.TotalSeconds, 3);
    }

    [Fact]
    public void Rate_limit_longer_than_max_wait_stops()
    {
        Assert.False(Decide(AiErrorKind.RateLimited, TimeSpan.FromSeconds(90)).Retry);
        Assert.False(Decide(AiErrorKind.RateLimited, TimeSpan.FromSeconds(37), jitter: 0.5).Retry);
        Assert.True(Decide(AiErrorKind.RateLimited, TimeSpan.FromSeconds(30), jitter: 0.5).Retry);
    }

    [Fact]
    public void Rate_limit_without_delay_needs_fallback()
    {
        Assert.False(Decide(AiErrorKind.RateLimited).Retry);
        Assert.True(Decide(AiErrorKind.RateLimited, fallback: 30).Retry);
        Assert.False(Decide(AiErrorKind.RateLimited, fallback: 35, max429: 5).Retry);
    }

    [Fact]
    public void Wait_must_fit_into_remaining_budget()
    {
        Assert.False(Decide(AiErrorKind.RateLimited, TimeSpan.FromSeconds(20), remaining: 20).Retry);
        Assert.False(Decide(AiErrorKind.Unavailable, remaining: 2.5).Retry);
        Assert.True(Decide(AiErrorKind.Unavailable, remaining: 3).Retry);
    }
}

public class GeminiResponseParserTests
{
    [Fact]
    public void Multiple_parts_are_joined_and_thought_parts_skipped()
    {
        const string body = """
            {"candidates":[{"content":{"parts":[
              {"text":"düşünce","thought":true},
              {"text":"{\"a\":"},
              {"text":"1}"}]},"finishReason":"STOP"}],
             "usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"thoughtsTokenCount":7}}
            """;

        var parsed = GeminiResponseParser.Parse(200, body);

        Assert.True(parsed.Succeeded);
        Assert.Equal("{\"a\":1}", parsed.Json);
        Assert.Equal(10, parsed.InputTokens);
        Assert.Equal(5, parsed.OutputTokens);
        Assert.Equal(7, parsed.ThinkingTokens);
    }

    [Fact]
    public void Prompt_block_without_candidates_is_blocked()
    {
        var parsed = GeminiResponseParser.Parse(200, """{"promptFeedback":{"blockReason":"SAFETY"}}""");

        Assert.Equal(AiErrorKind.Blocked, parsed.ErrorKind);
    }

    [Theory]
    [InlineData("SAFETY", AiErrorKind.Blocked)]
    [InlineData("PROHIBITED_CONTENT", AiErrorKind.Blocked)]
    [InlineData("RECITATION", AiErrorKind.Blocked)]
    [InlineData("BLOCKLIST", AiErrorKind.Blocked)]
    [InlineData("SPII", AiErrorKind.Blocked)]
    [InlineData("MAX_TOKENS", AiErrorKind.Truncated)]
    [InlineData("OTHER", AiErrorKind.InvalidOutput)]
    public void Finish_reason_table(string finish, AiErrorKind expected)
    {
        var body = $$"""{"candidates":[{"content":{"parts":[{"text":"{}"}]},"finishReason":"{{finish}}"}]}""";

        var parsed = GeminiResponseParser.Parse(200, body);

        Assert.False(parsed.Succeeded);
        Assert.Equal(expected, parsed.ErrorKind);
        Assert.Equal(finish, parsed.FinishReason);
    }

    [Theory]
    [InlineData("")]
    [InlineData("bozuk")]
    [InlineData("{}")]
    [InlineData("""{"candidates":[{"finishReason":"STOP"}]}""")]
    [InlineData("""{"candidates":[{"content":{"parts":[{"text":"düz metin"}]},"finishReason":"STOP"}]}""")]
    [InlineData("""{"candidates":[{"content":{"parts":[{"text":"[1,2]"}]},"finishReason":"STOP"}]}""")]
    public void Empty_or_malformed_success_bodies_are_invalid_output(string body)
    {
        var parsed = GeminiResponseParser.Parse(200, body);

        Assert.False(parsed.Succeeded);
        Assert.Equal(AiErrorKind.InvalidOutput, parsed.ErrorKind);
    }

    [Theory]
    [InlineData(429, AiErrorKind.RateLimited)]
    [InlineData(401, AiErrorKind.AuthFailed)]
    [InlineData(403, AiErrorKind.AuthFailed)]
    [InlineData(400, AiErrorKind.InvalidRequest)]
    [InlineData(404, AiErrorKind.InvalidRequest)]
    [InlineData(500, AiErrorKind.Unavailable)]
    [InlineData(502, AiErrorKind.Unavailable)]
    [InlineData(503, AiErrorKind.Unavailable)]
    [InlineData(504, AiErrorKind.Timeout)]
    [InlineData(408, AiErrorKind.Timeout)]
    public void Http_status_table(int status, AiErrorKind expected)
    {
        var parsed = GeminiResponseParser.Parse(status, """{"error":{"code":1,"message":"x"}}""");

        Assert.False(parsed.Succeeded);
        Assert.Equal(expected, parsed.ErrorKind);
    }

    [Fact]
    public void Retry_info_and_per_day_quota_are_read_from_details()
    {
        var parsed = GeminiResponseParser.Parse(429, AiTestData.RateLimitBody("12.5s", "GenerateRequestsPerDayPerProjectPerModel-FreeTier"));

        Assert.Equal(AiErrorKind.QuotaExhausted, parsed.ErrorKind);
        Assert.Equal(TimeSpan.FromSeconds(12.5), parsed.RetryDelay);
    }

    [Fact]
    public void Per_minute_quota_stays_rate_limited()
    {
        var parsed = GeminiResponseParser.Parse(429, AiTestData.RateLimitBody("30s", "GenerateRequestsPerMinutePerProjectPerModel"));

        Assert.Equal(AiErrorKind.RateLimited, parsed.ErrorKind);
        Assert.Equal(TimeSpan.FromSeconds(30), parsed.RetryDelay);
    }

    [Fact]
    public void Non_json_error_body_still_classifies_by_status()
    {
        var parsed = GeminiResponseParser.Parse(503, "<html>Service Unavailable</html>");

        Assert.Equal(AiErrorKind.Unavailable, parsed.ErrorKind);
        Assert.False(string.IsNullOrWhiteSpace(parsed.ErrorMessage));
    }

    [Fact]
    public void Error_message_is_truncated()
    {
        var body = "{\"error\":{\"code\":400,\"message\":\"" + new string('x', 5000) + "\"}}";

        var parsed = GeminiResponseParser.Parse(400, body);

        Assert.Equal(2000, parsed.ErrorMessage!.Length);
    }

    [Theory]
    [InlineData("7s", 7)]
    [InlineData("0.5s", 0.5)]
    [InlineData("30", 30)]
    public void Duration_parsing(string value, double seconds)
    {
        Assert.Equal(TimeSpan.FromSeconds(seconds), GeminiResponseParser.ParseDuration(value));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("-5s")]
    public void Invalid_duration_is_null(string? value)
    {
        Assert.Null(GeminiResponseParser.ParseDuration(value));
    }
}

public class AiCostCalculatorTests
{
    private static readonly DateTimeOffset Switch = new(2027, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static AiCostCalculator Create(DateTimeOffset? now = null, params AiPriceChangeOptions[] changes)
    {
        var options = new AiOptions();
        options.Pricing = new Dictionary<string, AiPricingOptions>(StringComparer.OrdinalIgnoreCase)
        {
            ["gemini-3.8-flash"] = new() { InputPerMTokUsd = 0.75m, OutputPerMTokUsd = 3.75m, Changes = changes.ToList() }
        };
        var clock = new Microsoft.Extensions.Time.Testing.FakeTimeProvider(now ?? new DateTimeOffset(2026, 11, 26, 12, 0, 0, TimeSpan.Zero));
        return new AiCostCalculator(Microsoft.Extensions.Options.Options.Create(options), clock);
    }

    private static AiPriceChangeOptions Change(DateTimeOffset from, decimal input, decimal output) =>
        new() { EffectiveFrom = from, InputPerMTokUsd = input, OutputPerMTokUsd = output };

    [Fact]
    public void Before_effective_date_base_price_applies()
    {
        var calc = Create(Switch.AddTicks(-1), Change(Switch, 1.5m, 7.5m));

        Assert.Equal(4.5m, calc.Calculate("gemini-3.8-flash", 1_000_000, 1_000_000, null));
    }

    [Fact]
    public void Exactly_at_effective_date_new_price_applies()
    {
        var calc = Create(Switch, Change(Switch, 1.5m, 7.5m));

        Assert.Equal(9m, calc.Calculate("gemini-3.8-flash", 1_000_000, 1_000_000, null));
    }

    [Fact]
    public void Latest_applicable_change_wins_regardless_of_order()
    {
        var later = Switch.AddMonths(6);
        var changes = new[] { Change(later, 3m, 9m), Change(Switch, 1.5m, 7.5m) };

        Assert.Equal(9m, Create(Switch.AddDays(10), changes).Calculate("gemini-3.8-flash", 1_000_000, 1_000_000, null));
        Assert.Equal(12m, Create(later, changes).Calculate("gemini-3.8-flash", 1_000_000, 1_000_000, null));
    }

    [Fact]
    public void Dated_price_applies_to_prefix_matched_model_and_thinking_tokens()
    {
        var calc = Create(Switch.AddDays(1), Change(Switch, 1.5m, 7.5m));

        Assert.Equal(9m, calc.Calculate("gemini-3.8-flash-001", 1_000_000, 500_000, 500_000));
    }

    [Fact]
    public void Offset_effective_date_is_compared_as_an_instant()
    {
        var change = Change(new DateTimeOffset(2027, 1, 1, 3, 0, 0, TimeSpan.FromHours(3)), 1.5m, 7.5m);

        Assert.Equal(4.5m, Create(Switch.AddTicks(-1), change).Calculate("gemini-3.8-flash", 1_000_000, 1_000_000, null));
        Assert.Equal(9m, Create(Switch, change).Calculate("gemini-3.8-flash", 1_000_000, 1_000_000, null));
    }

    [Fact]
    public void Thinking_tokens_are_billed_at_output_price()
    {
        var cost = Create().Calculate("gemini-3.8-flash", 1000, 2000, 500);

        Assert.Equal(0.010125m, cost);
    }

    [Fact]
    public void One_million_tokens_each_costs_the_list_price()
    {
        Assert.Equal(4.5m, Create().Calculate("gemini-3.8-flash", 1_000_000, 1_000_000, null));
    }

    [Fact]
    public void Model_lookup_ignores_case_and_matches_versioned_names()
    {
        Assert.NotNull(Create().Calculate("Gemini-3.8-Flash", 10, 10, 0));
        Assert.NotNull(Create().Calculate("gemini-3.8-flash-001", 10, 10, 0));
    }

    [Fact]
    public void Unknown_model_or_missing_usage_gives_null()
    {
        Assert.Null(Create().Calculate("gemini-9", 10, 10, 0));
        Assert.Null(Create().Calculate(null, 10, 10, 0));
        Assert.Null(Create().Calculate("gemini-3.8-flash", null, null, null));
    }

    [Fact]
    public void Cost_is_rounded_to_six_decimals()
    {
        Assert.Equal(0.000001m, Create().Calculate("gemini-3.8-flash", 1, 0, 0));
        Assert.Equal(0m, Create().Calculate("gemini-3.8-flash", 0, 0, 0));
    }
}
