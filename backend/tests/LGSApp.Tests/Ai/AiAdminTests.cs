using System.Text.Json;
using System.Text.Json.Serialization;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Ai;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Scheduler;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Ai;

public class AiUsageRulesTests
{
    private static readonly DateOnly Today = new(2026, 11, 14);

    [Fact]
    public void Defaults_to_last_seven_days_ending_today()
    {
        var r = AiUsageRules.Resolve(null, null, Today).Value!;
        Assert.Equal(new DateOnly(2026, 11, 8), r.From);
        Assert.Equal(Today, r.To);
        Assert.Equal(7, r.Days);
    }

    [Fact]
    public void Day_bounds_are_turkey_midnight_in_utc()
    {
        var r = AiUsageRules.Resolve(new DateOnly(2026, 11, 13), new DateOnly(2026, 11, 14), Today).Value!;
        Assert.Equal(new DateTime(2026, 11, 12, 21, 0, 0, DateTimeKind.Utc), r.FromUtc);
        Assert.Equal(new DateTime(2026, 11, 14, 21, 0, 0, DateTimeKind.Utc), r.ToUtc);
        Assert.Equal(2, r.Days);
    }

    [Fact]
    public void Only_from_ends_today_and_only_to_starts_six_days_earlier()
    {
        var a = AiUsageRules.Resolve(new DateOnly(2026, 11, 10), null, Today).Value!;
        Assert.Equal(Today, a.To);
        Assert.Equal(5, a.Days);

        var b = AiUsageRules.Resolve(null, new DateOnly(2026, 10, 20), Today).Value!;
        Assert.Equal(new DateOnly(2026, 10, 14), b.From);
    }

    [Fact]
    public void From_after_to_is_rejected()
    {
        var r = AiUsageRules.Resolve(new DateOnly(2026, 11, 14), new DateOnly(2026, 11, 13), Today);
        Assert.False(r.Succeeded);
        Assert.Equal(ServiceErrorKind.Validation, r.Error);
        Assert.Equal(AiUsageRules.InvalidOrderMessage, r.Message);
    }

    [Fact]
    public void Only_from_in_the_future_is_rejected()
    {
        Assert.False(AiUsageRules.Resolve(new DateOnly(2026, 11, 20), null, Today).Succeeded);
    }

    [Fact]
    public void Range_of_92_days_is_accepted_and_93_is_rejected()
    {
        var to = new DateOnly(2026, 11, 14);
        Assert.True(AiUsageRules.Resolve(to.AddDays(-91), to, Today).Succeeded);
        var over = AiUsageRules.Resolve(to.AddDays(-92), to, Today);
        Assert.False(over.Succeeded);
        Assert.Equal(AiUsageRules.TooLongMessage, over.Message);
    }

    [Fact]
    public void Extreme_dates_are_rejected_without_overflow()
    {
        var r = AiUsageRules.Resolve(new DateOnly(9999, 12, 30), new DateOnly(9999, 12, 31), Today);
        Assert.False(r.Succeeded);
        Assert.Equal(ServiceErrorKind.Validation, r.Error);
        Assert.Equal(AiUsageRules.OutOfBoundsMessage, r.Message);
        Assert.Equal("Tarih aralığı geçerli sınırlar dışında.", AiUsageRules.OutOfBoundsMessage);
    }

    [Fact]
    public void Dates_before_the_minimum_are_rejected()
    {
        var early = AiUsageRules.Resolve(new DateOnly(2024, 12, 31), new DateOnly(2025, 1, 2), Today);
        Assert.False(early.Succeeded);
        Assert.Equal(AiUsageRules.OutOfBoundsMessage, early.Message);
        Assert.False(AiUsageRules.Resolve(DateOnly.MinValue, DateOnly.MinValue, Today).Succeeded);
        Assert.True(AiUsageRules.Resolve(AiUsageRules.MinDate, AiUsageRules.MinDate.AddDays(1), Today).Succeeded);
    }

    [Fact]
    public void Upper_bound_is_tomorrow()
    {
        var tomorrow = Today.AddDays(1);
        Assert.True(AiUsageRules.Resolve(Today, tomorrow, Today).Succeeded);
        var over = AiUsageRules.Resolve(Today, tomorrow.AddDays(1), Today);
        Assert.False(over.Succeeded);
        Assert.Equal(AiUsageRules.OutOfBoundsMessage, over.Message);
        Assert.Equal(AiUsageRules.OutOfBoundsMessage, AiUsageRules.Resolve(tomorrow.AddDays(1), null, Today).Message);
    }

    private static AiUsageGroup G(int bucket, AiOperation op, AiLogStatus status, AiErrorKind kind, int rows, int limit = 0, long inTok = 0, long outTok = 0, decimal cost = 0) =>
        new(bucket, op, status, kind, rows, limit, inTok, outTok, 0, cost);

    [Fact]
    public void Aggregate_separates_pending_and_computes_rates_tokens_and_errors()
    {
        var range = AiUsageRules.Resolve(new DateOnly(2026, 11, 13), new DateOnly(2026, 11, 14), Today).Value!;
        var groups = new[]
        {
            G(0, AiOperation.Solution, AiLogStatus.Succeeded, AiErrorKind.None, 3, 3, 300, 600, 0.03m),
            G(0, AiOperation.Solution, AiLogStatus.Failed, AiErrorKind.Unavailable, 1, 0, 0, 0, 0m),
            G(0, AiOperation.Solution, AiLogStatus.Rejected, AiErrorKind.Unreadable, 1, 1, 50, 5, 0.01m),
            G(0, AiOperation.Solution, AiLogStatus.Pending, AiErrorKind.None, 2, 2),
            G(1, AiOperation.QuestionGeneration, AiLogStatus.Succeeded, AiErrorKind.None, 2, 0, 200, 400, 0.02m),
            G(5, AiOperation.Solution, AiLogStatus.Succeeded, AiErrorKind.None, 9)
        };

        var (days, totals) = AiUsageRules.Aggregate(range, groups);

        Assert.Equal(2, days.Count);
        var day0 = days[0];
        Assert.Equal(new DateOnly(2026, 11, 13), day0.Date);
        Assert.Equal(AiOperation.Solution, day0.Operation);
        Assert.Equal(5, day0.Calls);
        Assert.Equal(3, day0.Succeeded);
        Assert.Equal(1, day0.Failed);
        Assert.Equal(1, day0.Rejected);
        Assert.Equal(2, day0.Pending);
        Assert.Equal(0.6m, day0.SuccessRate);
        Assert.Equal(350, day0.InputTokens);
        Assert.Equal(0.04m, day0.CostUsd);
        Assert.Equal(4, day0.LimitConsumed);
        Assert.Equal(2, day0.ErrorKinds.Count);

        Assert.Equal(7, totals.Calls);
        Assert.Equal(2, totals.Pending);
        Assert.Equal(550, totals.InputTokens);
        Assert.Equal(0.06m, totals.CostUsd);
    }

    [Fact]
    public void Success_rate_is_null_when_there_are_no_finished_calls()
    {
        var range = AiUsageRules.Resolve(Today, Today, Today).Value!;
        var (days, totals) = AiUsageRules.Aggregate(range, [G(0, AiOperation.Solution, AiLogStatus.Pending, AiErrorKind.None, 2)]);
        Assert.Null(days[0].SuccessRate);
        Assert.Null(totals.SuccessRate);
        Assert.Equal(0, totals.Calls);
        Assert.Equal(2, totals.Pending);
    }

    [Fact]
    public void Refund_rows_count_as_failed_calls_but_not_as_limit_consumption()
    {
        var range = AiUsageRules.Resolve(Today, Today, Today).Value!;
        var (_, totals) = AiUsageRules.Aggregate(range,
        [
            G(0, AiOperation.Solution, AiLogStatus.Failed, AiErrorKind.Unavailable, 2, 0),
            G(0, AiOperation.Solution, AiLogStatus.Succeeded, AiErrorKind.None, 1, 1)
        ]);
        Assert.Equal(3, totals.Calls);
        Assert.Equal(2, totals.Failed);
        Assert.Equal(1, totals.LimitConsumed);
    }

    [Fact]
    public void Queries_translate_to_server_side_grouping()
    {
        var builder = new DbContextOptionsBuilder<AppDbContext>().UseSqlServer("Server=.;Database=Yok;Trusted_Connection=True;TrustServerCertificate=True");
        using var db = new AppDbContext(builder.Options);
        var from = new DateTime(2026, 11, 7, 21, 0, 0, DateTimeKind.Utc);
        var to = new DateTime(2026, 11, 14, 21, 0, 0, DateTimeKind.Utc);

        var sql = AiAdminService.GroupQuery(db, from, to).ToQueryString();
        var userSql = AiAdminService.UserQuery(db, from, to).ToQueryString();

        Assert.Contains("GROUP BY", sql);
        Assert.Contains("DATEDIFF(hour", sql);
        Assert.Contains("GROUP BY", userSql);
    }
}

public class AiAdminStatusTests
{
    private sealed class FakeSettings : ISettingsService
    {
        public Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default) => Task.FromResult(key == "aiGunlukCozumGlobalLimit" ? 150 : 1);
        public void Invalidate() { }
    }

    private sealed class FakeQuota : IAiQuotaService
    {
        public Task<AiReservation> ReserveAsync(Actor actor, int questionId, string? model, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task ReleaseAsync(long logId, AiErrorKind errorKind, string? message, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task DiscardAsync(long logId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<AiQuotaSummary> GetSummaryAsync(Actor actor, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<AiQuotaStatusView> GetStatusAsync(Actor actor, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<int> GetGlobalUsedTodayAsync(CancellationToken cancellationToken) => Task.FromResult(42);
    }

    private sealed class FakeGenerator(bool configured) : IQuestionGenerator
    {
        public bool IsConfigured => configured;
        public Task<QuestionGenerationResult> GenerateAsync(QuestionGenerationRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private sealed class FakeVerifier(bool enabled) : IQuestionVerifier
    {
        public Task<bool> IsEnabledAsync(CancellationToken cancellationToken) => Task.FromResult(enabled);
        public Task<QuestionVerification> VerifyAsync(QuestionGenerationRequest request, ValidatedQuestion question, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private static readonly JsonSerializerOptions Json = new()
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static (AiAdminService Service, AiProviderGate Gate) Create(AiOptions options, bool verifier = true)
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 14, 20, 0, 0, TimeSpan.Zero));
        var gate = new AiProviderGate(clock, Options.Create(options));
        var service = new AiAdminService(null!, null!, new FakeSettings(), new FakeQuota(), new FakeGenerator(options.QuestionConfigured), new FakeVerifier(verifier), gate, Options.Create(options), new TurkeyTime(clock));
        return (service, gate);
    }

    [Fact]
    public async Task Status_never_contains_key_material()
    {
        var options = AiTestData.GeminiOptions();
        var (service, gate) = Create(options);
        gate.Observe(AiKeyPurpose.Solution, AiErrorKind.AuthFailed);
        gate.Observe(AiKeyPurpose.Question, AiErrorKind.QuotaExhausted);

        var status = await service.GetStatusAsync(CancellationToken.None);
        var json = JsonSerializer.Serialize(status, Json);

        Assert.DoesNotContain(AiTestData.QuestionKey, json);
        Assert.DoesNotContain(AiTestData.SolutionKey, json);
        Assert.DoesNotContain("TEST-QUESTION", json);
        Assert.DoesNotContain("TEST-SOLUTION", json);
        Assert.DoesNotContain("apikey", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("base", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("example.test", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Status_reports_models_gate_and_counters()
    {
        var options = AiTestData.GeminiOptions();
        var (service, gate) = Create(options);
        gate.Observe(AiKeyPurpose.Solution, AiErrorKind.AuthFailed);

        var status = await service.GetStatusAsync(CancellationToken.None);

        Assert.Equal(AiProvider.Gemini, status.Provider);
        Assert.True(status.QuestionConfigured);
        Assert.True(status.SolutionConfigured);
        Assert.True(status.AiConfigured);
        Assert.True(status.VerificationEnabled);
        Assert.True(status.AiCozumAktifMi);
        Assert.Equal("gemini-3.8-flash", status.QuestionModel);
        Assert.Equal(42, status.TodayGlobalUsed);
        Assert.Equal(150, status.GlobalLimit);
        Assert.Equal(new DateTime(2026, 11, 14, 21, 0, 0, DateTimeKind.Utc), status.QuotaResetsAt);

        var question = status.Gates.Single(g => g.Purpose == AiKeyPurpose.Question);
        var solution = status.Gates.Single(g => g.Purpose == AiKeyPurpose.Solution);
        Assert.False(question.Tripped);
        Assert.Null(question.Reason);
        Assert.True(solution.Tripped);
        Assert.Equal(AiErrorKind.AuthFailed, solution.Kind);
        Assert.Equal(AiMessages.GateAuthFailed, solution.Reason);
        Assert.NotNull(solution.Until);
    }

    [Fact]
    public async Task Ai_configured_follows_scheduler_rule()
    {
        var options = AiTestData.GeminiOptions();
        options.Gemini.SolutionApiKey = string.Empty;

        var (service, _) = Create(options, verifier: true);
        var status = await service.GetStatusAsync(CancellationToken.None);

        Assert.True(status.QuestionConfigured);
        Assert.False(status.SolutionConfigured);
        Assert.Equal(SchedulerQueryService.ComputeAiConfigured(true, true, false), status.AiConfigured);
        Assert.False(status.AiConfigured);
    }

    [Theory]
    [InlineData(AiErrorKind.QuotaExhausted)]
    [InlineData(AiErrorKind.AuthFailed)]
    public void Gate_reason_is_fixed_turkish_text(AiErrorKind kind)
    {
        var reason = AiAdminService.GateReason(kind);
        Assert.False(string.IsNullOrWhiteSpace(reason));
        Assert.DoesNotContain("http", reason!, StringComparison.OrdinalIgnoreCase);
    }
}
