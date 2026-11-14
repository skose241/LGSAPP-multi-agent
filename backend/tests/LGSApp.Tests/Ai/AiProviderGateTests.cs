using System.Net;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Ai;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Ai;

public class AiProviderGateTests
{
    private static readonly DateTimeOffset Noon = new(2026, 11, 14, 20, 0, 0, TimeSpan.Zero);

    private static (AiProviderGate Gate, FakeTimeProvider Clock) Create(AiOptions? options = null)
    {
        var clock = new FakeTimeProvider(Noon);
        return (new AiProviderGate(clock, Options.Create(options ?? AiTestData.GeminiOptions())), clock);
    }

    [Fact]
    public void Quota_exhaustion_keeps_gate_open_until_pacific_midnight_then_closes()
    {
        var (gate, clock) = Create();

        gate.Observe(AiKeyPurpose.Solution, AiErrorKind.QuotaExhausted);

        var state = gate.Check(AiKeyPurpose.Solution);
        Assert.NotNull(state);
        Assert.Equal(AiErrorKind.QuotaExhausted, state.Value.Kind);
        Assert.Equal(12 * 3600, state.Value.RetryAfterSeconds);

        clock.Advance(TimeSpan.FromHours(11) + TimeSpan.FromMinutes(59));
        var almost = gate.Check(AiKeyPurpose.Solution);
        Assert.NotNull(almost);
        Assert.InRange(almost.Value.RetryAfterSeconds, 1, 60);

        clock.Advance(TimeSpan.FromMinutes(2));
        Assert.Null(gate.Check(AiKeyPurpose.Solution));
    }

    [Fact]
    public void Auth_failure_pauses_for_configured_minutes()
    {
        var options = AiTestData.GeminiOptions();
        options.Solution.AuthFailedPauseMinutes = 10;
        var (gate, clock) = Create(options);

        gate.Observe(AiKeyPurpose.Solution, AiErrorKind.AuthFailed);

        var state = gate.Check(AiKeyPurpose.Solution);
        Assert.Equal(AiErrorKind.AuthFailed, state!.Value.Kind);
        Assert.Equal(600, state.Value.RetryAfterSeconds);

        clock.Advance(TimeSpan.FromMinutes(9) + TimeSpan.FromSeconds(59));
        Assert.NotNull(gate.Check(AiKeyPurpose.Solution));

        clock.Advance(TimeSpan.FromSeconds(2));
        Assert.Null(gate.Check(AiKeyPurpose.Solution));
    }

    [Fact]
    public void Auth_pause_follows_option_per_purpose()
    {
        var options = AiTestData.GeminiOptions();
        options.Solution.AuthFailedPauseMinutes = 3;
        options.Question.AuthFailedPauseMinutes = 25;
        var (gate, _) = Create(options);

        gate.Observe(AiKeyPurpose.Solution, AiErrorKind.AuthFailed);
        gate.Observe(AiKeyPurpose.Question, AiErrorKind.AuthFailed);

        Assert.Equal(180, gate.Check(AiKeyPurpose.Solution)!.Value.RetryAfterSeconds);
        Assert.Equal(1500, gate.Check(AiKeyPurpose.Question)!.Value.RetryAfterSeconds);
    }

    [Fact]
    public void Purposes_are_independent()
    {
        var (gate, _) = Create();

        gate.Observe(AiKeyPurpose.Question, AiErrorKind.QuotaExhausted);

        Assert.NotNull(gate.Check(AiKeyPurpose.Question));
        Assert.Null(gate.Check(AiKeyPurpose.Solution));
    }

    [Theory]
    [InlineData(AiErrorKind.RateLimited)]
    [InlineData(AiErrorKind.Unavailable)]
    [InlineData(AiErrorKind.Timeout)]
    [InlineData(AiErrorKind.InvalidRequest)]
    [InlineData(AiErrorKind.Blocked)]
    [InlineData(AiErrorKind.InvalidOutput)]
    [InlineData(AiErrorKind.None)]
    public void Other_kinds_do_not_open_the_gate(AiErrorKind kind)
    {
        var (gate, _) = Create();

        gate.Observe(AiKeyPurpose.Solution, kind);

        Assert.Null(gate.Check(AiKeyPurpose.Solution));
    }

    [Fact]
    public void Later_auth_failure_does_not_shorten_quota_window()
    {
        var (gate, _) = Create();
        gate.Observe(AiKeyPurpose.Solution, AiErrorKind.QuotaExhausted);

        gate.Observe(AiKeyPurpose.Solution, AiErrorKind.AuthFailed);

        var state = gate.Check(AiKeyPurpose.Solution)!.Value;
        Assert.Equal(AiErrorKind.QuotaExhausted, state.Kind);
        Assert.Equal(12 * 3600, state.RetryAfterSeconds);
    }

    [Fact]
    public void Quota_window_closes_right_after_pacific_midnight()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 15, 7, 59, 0, TimeSpan.Zero));
        var gate = new AiProviderGate(clock, Options.Create(AiTestData.GeminiOptions()));

        gate.Observe(AiKeyPurpose.Solution, AiErrorKind.QuotaExhausted);

        Assert.Equal(60, gate.Check(AiKeyPurpose.Solution)!.Value.RetryAfterSeconds);
        clock.Advance(TimeSpan.FromSeconds(61));
        Assert.Null(gate.Check(AiKeyPurpose.Solution));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1441)]
    public void Pause_minutes_out_of_range_fail_validation(int minutes)
    {
        var options = AiTestData.GeminiOptions();
        options.Solution.AuthFailedPauseMinutes = minutes;

        Assert.NotNull(AiOptions.Validate(options, false));
    }

    [Fact]
    public void Default_pause_is_ten_minutes_and_valid()
    {
        var options = AiTestData.GeminiOptions();

        Assert.Equal(10, options.Solution.AuthFailedPauseMinutes);
        Assert.Equal(10, options.Question.AuthFailedPauseMinutes);
        Assert.Null(AiOptions.Validate(options, false));
    }
}

public class AiGateIntegrationTests
{
    private static readonly DateTimeOffset Start = new(2026, 11, 14, 20, 0, 0, TimeSpan.Zero);

    private static string QuotaBody => AiTestData.RateLimitBody("5s", "GenerateRequestsPerDayPerProjectPerModel");

    private static string Payload() =>
        "{\"readable\":true,\"answer\":\"B\",\"confidence\":\"high\",\"solution\":\"" + new string('s', 70) + "\"}";

    private static (GeminiAiSolver Solver, GeminiQuestionGenerator Generator, AiProviderGate Gate, StubHandler Handler, FakeTimeProvider Clock) Create()
    {
        var clock = new FakeTimeProvider(Start);
        var handler = new StubHandler(clock);
        var options = AiTestData.GeminiOptions();
        var client = AiTestData.CreateClient(handler, clock, options);
        var gate = new AiProviderGate(clock, Options.Create(options));
        var solver = new GeminiAiSolver(client, Options.Create(options), gate);
        var generator = new GeminiQuestionGenerator(
            client, Options.Create(options), new AiCostCalculator(Options.Create(options)), gate, clock, NullLogger<GeminiQuestionGenerator>.Instance);
        return (solver, generator, gate, handler, clock);
    }

    private static AiSolveInput Input() =>
        new("Matematik", "Üslü Sayılar", "2 üzeri 3 kaçtır?", "6", "8", "9", "12", null, null);

    private static QuestionGenerationRequest Request() => new(7, "Matematik", 11, "Üslü Sayılar", 2, 1, [], 3);

    [Fact]
    public async Task Solver_quota_exhaustion_blocks_following_calls_until_reset_without_http()
    {
        var (solver, _, gate, handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.TooManyRequests, QuotaBody);

        var first = await solver.SolveAsync(1, Input(), AiSolveMode.Blind, CancellationToken.None);

        Assert.Equal(AiErrorKind.QuotaExhausted, first.ErrorKind);
        Assert.Equal(TimeSpan.FromHours(12), first.RetryAfter);
        Assert.Single(handler.Requests);

        var second = await solver.SolveAsync(2, Input(), AiSolveMode.Blind, CancellationToken.None);

        Assert.Equal(AiErrorKind.QuotaExhausted, second.ErrorKind);
        Assert.Equal(0, second.Attempts);
        Assert.Equal(SchedulerMessages.AiQuotaExhausted, second.ErrorMessage);
        Assert.Single(handler.Requests);
        Assert.Null(gate.Check(AiKeyPurpose.Question));

        clock.Advance(TimeSpan.FromHours(12) + TimeSpan.FromSeconds(1));
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload()));

        var third = await solver.SolveAsync(3, Input(), AiSolveMode.Blind, CancellationToken.None);

        Assert.True(third.Succeeded);
        Assert.Equal(2, handler.Requests.Count);
    }

    [Fact]
    public async Task Solver_auth_failure_pauses_ten_minutes()
    {
        var (solver, _, _, handler, clock) = Create();
        handler.EnqueueJson(HttpStatusCode.Unauthorized, "{\"error\":{\"code\":401,\"message\":\"bad key\"}}");

        var first = await solver.SolveAsync(1, Input(), AiSolveMode.Blind, CancellationToken.None);
        Assert.Equal(AiErrorKind.AuthFailed, first.ErrorKind);
        Assert.Equal(TimeSpan.FromMinutes(10), first.RetryAfter);

        clock.Advance(TimeSpan.FromMinutes(5));
        var blocked = await solver.SolveAsync(2, Input(), AiSolveMode.Blind, CancellationToken.None);
        Assert.Equal(AiErrorKind.AuthFailed, blocked.ErrorKind);
        Assert.Single(handler.Requests);

        clock.Advance(TimeSpan.FromMinutes(6));
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload()));
        Assert.True((await solver.SolveAsync(3, Input(), AiSolveMode.Blind, CancellationToken.None)).Succeeded);
    }

    [Fact]
    public async Task Generator_quota_exhaustion_blocks_following_slots_without_http_and_not_the_solver()
    {
        var (solver, generator, gate, handler, _) = Create();
        handler.EnqueueJson(HttpStatusCode.TooManyRequests, QuotaBody);

        var first = await generator.GenerateAsync(Request(), CancellationToken.None);
        Assert.Equal(AiErrorKind.QuotaExhausted, first.ErrorKind);
        Assert.Equal(SchedulerMessages.AiQuotaExhausted, first.Error);

        var second = await generator.GenerateAsync(Request(), CancellationToken.None);

        Assert.False(second.Succeeded);
        Assert.Equal(AiErrorKind.QuotaExhausted, second.ErrorKind);
        Assert.Equal(0, second.AttemptCount);
        Assert.Equal(SchedulerMessages.AiQuotaExhausted, second.Error);
        Assert.Single(handler.Requests);
        Assert.Null(gate.Check(AiKeyPurpose.Solution));

        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload()));
        Assert.True((await solver.SolveAsync(1, Input(), AiSolveMode.Blind, CancellationToken.None)).Succeeded);
    }

    [Fact]
    public async Task Generator_failure_message_never_contains_provider_text()
    {
        var (_, generator, _, handler, _) = Create();
        handler.EnqueueJson(HttpStatusCode.BadRequest, "{\"error\":{\"code\":400,\"message\":\"overloaded secret-detail\"}}");

        var result = await generator.GenerateAsync(Request(), CancellationToken.None);

        Assert.Equal(SchedulerMessages.AiInvalidRequest, result.Error);
        Assert.DoesNotContain("overloaded", result.Error);
        Assert.Contains("overloaded", result.RawError);
    }

    [Fact]
    public async Task Verifier_sees_solution_gate_and_makes_no_call()
    {
        var (_, _, gate, _, _) = Create();
        var options = AiTestData.GeminiOptions();
        var solver = new CountingSolver();
        var verifier = new QuestionVerifier(solver, new FixedSettings(), Options.Create(options), new AiCostCalculator(Options.Create(options)), gate);
        gate.Observe(AiKeyPurpose.Solution, AiErrorKind.QuotaExhausted);

        var result = await verifier.VerifyAsync(
            Request(), new ValidatedQuestion("Soru?", "a", "b", "c", "d", 2, new string('e', 60)), CancellationToken.None);

        Assert.False(result.Passed);
        Assert.Equal(AiErrorKind.QuotaExhausted, result.ErrorKind);
        Assert.Equal(SchedulerMessages.AiQuotaExhausted, result.Error);
        Assert.Equal(0, result.AttemptCount);
        Assert.Equal(0, solver.Calls);
    }

    [Fact]
    public async Task Verifier_ignores_question_gate()
    {
        var (_, _, gate, _, _) = Create();
        var options = AiTestData.GeminiOptions();
        var solver = new CountingSolver();
        var verifier = new QuestionVerifier(solver, new FixedSettings(), Options.Create(options), new AiCostCalculator(Options.Create(options)), gate);
        gate.Observe(AiKeyPurpose.Question, AiErrorKind.QuotaExhausted);

        await verifier.VerifyAsync(
            Request(), new ValidatedQuestion("Soru?", "a", "b", "c", "d", 2, new string('e', 60)), CancellationToken.None);

        Assert.Equal(1, solver.Calls);
    }

    private sealed class FixedSettings : LGSApp.Infrastructure.Services.Settings.ISettingsService
    {
        public Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default) => Task.FromResult(1);

        public void Invalidate()
        {
        }
    }

    private sealed class CountingSolver : IAiSolver
    {
        public bool IsConfigured => true;

        public int Calls { get; private set; }

        public Task<AiSolveResult> SolveAsync(int questionId, AiSolveInput input, AiSolveMode mode, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(AiSolveResult.Failure(AiErrorKind.Unavailable, "x", "m", "p", 1, 10));
        }
    }
}

public class AiFailureTextAndLogTests
{
    [Theory]
    [InlineData(AiErrorKind.Unavailable, "Yapay zekâ şu anda yanıt vermiyor.")]
    [InlineData(AiErrorKind.Timeout, "Yapay zekâ yanıt vermedi (zaman aşımı).")]
    [InlineData(AiErrorKind.RateLimited, "Yapay zekâ istek sınırına takıldı.")]
    [InlineData(AiErrorKind.Blocked, "Yanıt engellendi.")]
    [InlineData(AiErrorKind.Truncated, "Yanıt yarım kaldı.")]
    [InlineData(AiErrorKind.InvalidOutput, "Yanıt beklenen biçimde değil.")]
    [InlineData(AiErrorKind.InvalidRequest, "Yapay zekâ isteği geçersiz.")]
    [InlineData(AiErrorKind.QuotaExhausted, "Yapay zekâ günlük kotası doldu.")]
    [InlineData(AiErrorKind.AuthFailed, "Yapay zekâ anahtarı geçersiz.")]
    public void Error_kind_map_gives_fixed_turkish_text(AiErrorKind kind, string expected)
    {
        Assert.Equal(expected, SchedulerMessages.ForErrorKind(kind, "ham metin"));
        var verification = SchedulerMessages.ForVerificationFailure(kind);
        Assert.DoesNotContain("ham", verification);
        Assert.EndsWith(expected, verification);
    }

    [Fact]
    public void Verification_failure_text_has_prefix_for_non_gate_kinds()
    {
        Assert.Equal("Doğrulama çağrısı başarısız: Yapay zekâ şu anda yanıt vermiyor.", SchedulerMessages.ForVerificationFailure(AiErrorKind.Unavailable));
        Assert.Equal("Doğrulama çağrısı başarısız.", SchedulerMessages.ForVerificationFailure(AiErrorKind.Canceled));
    }

    [Fact]
    public void Unknown_kind_uses_fallback()
    {
        Assert.Equal("özel", SchedulerMessages.ForErrorKind(AiErrorKind.Canceled, "özel"));
        Assert.Equal("Soru üretilemedi.", SchedulerMessages.ForErrorKind(AiErrorKind.Canceled, null));
    }

    [Fact]
    public void Sanitize_strips_control_characters_collapses_whitespace_and_truncates()
    {
        Assert.Null(AiErrorText.Sanitize("  \r\n\t "));
        Assert.Null(AiErrorText.Sanitize(null));
        Assert.Equal("a b c", AiErrorText.Sanitize("a\r\n\u0007 b\t\tc  "));
        Assert.Equal(2000, AiErrorText.Sanitize(new string('x', 5000))!.Length);
    }

    [Fact]
    public void Sanitize_does_not_split_surrogate_pair_at_limit()
    {
        var text = new string('x', 1999) + "\U0001F600";

        var result = AiErrorText.Sanitize(text)!;

        Assert.Equal(1999, result.Length);
    }

    [Fact]
    public void Failure_log_keeps_raw_text_only_in_ai_log_and_sanitized()
    {
        var result = QuestionGenerationResult.Failure(
            SchedulerMessages.AiUnavailable, true, "m", "p", null, 100, AiErrorKind.Unavailable, rawError: "overloaded\r\nretry later");

        var log = AiQuestionWriter.BuildGenerationFailureLog(result, SchedulerMessages.AiUnavailable, DateTime.UtcNow);

        Assert.NotNull(log);
        Assert.Equal("overloaded retry later", log.ErrorMessage);
        Assert.Equal(AiLogStatus.Failed, log.Status);
        Assert.Equal(AiErrorKind.Unavailable, log.ErrorKind);
    }

    [Fact]
    public void Failure_log_is_not_written_when_no_provider_call_was_made()
    {
        var result = QuestionGenerationResult.Failure(
            "Çalıştırma süresi dolduğu için soru üretilemedi.", true, "m", "p", errorKind: AiErrorKind.Timeout, attemptCount: 0);

        Assert.Null(AiQuestionWriter.BuildGenerationFailureLog(result, result.Error!, DateTime.UtcNow));
        Assert.Null(AiQuestionWriter.BuildGenerationFailureLog(null, "x", DateTime.UtcNow));
        Assert.False(AiQuestionWriter.HasProviderCall(0));
        Assert.True(AiQuestionWriter.HasProviderCall(1));
    }

    [Fact]
    public void Rejected_generation_keeps_validation_error_as_message()
    {
        var result = new QuestionGenerationResult(true, "t", "a", "b", "c", "d", 1, "e", "m", "p", "{}", AttemptCount: 2);

        var log = AiQuestionWriter.BuildGenerationFailureLog(result, "Son sorulara çok benzer.", DateTime.UtcNow);

        Assert.Equal(AiLogStatus.Rejected, log!.Status);
        Assert.Equal("Son sorulara çok benzer.", log.ErrorMessage);
        Assert.Equal(2, log.AttemptCount);
    }

    [Fact]
    public void Verification_log_skips_calls_that_never_happened_and_uses_raw_text()
    {
        var skipped = new QuestionVerification(
            false, SchedulerMessages.AiQuotaExhausted, AiErrorKind.QuotaExhausted, AiLogStatus.Failed, "m", null, null, null, null, null, null, 0, 0, null, null);
        Assert.Null(AiQuestionWriter.BuildVerificationLog(skipped, null, DateTime.UtcNow));
        Assert.Null(AiQuestionWriter.BuildVerificationLog(null, null, DateTime.UtcNow));

        var failed = skipped with { AttemptCount = 2, ErrorKind = AiErrorKind.Unavailable, Error = SchedulerMessages.ForVerificationFailure(AiErrorKind.Unavailable), RawError = "overloaded" };
        var log = AiQuestionWriter.BuildVerificationLog(failed, 5, DateTime.UtcNow);

        Assert.Equal("overloaded", log!.ErrorMessage);
        Assert.Equal(5, log.QuestionId);
        Assert.Equal(AiOperation.SolutionVerification, log.Operation);
    }

    [Theory]
    [InlineData(true, true, true, true)]
    [InlineData(true, true, false, false)]
    [InlineData(true, false, false, true)]
    [InlineData(false, true, true, false)]
    [InlineData(false, false, false, false)]
    public void Ai_configured_requires_solution_key_only_when_verification_is_enabled(bool generator, bool verification, bool solution, bool expected)
    {
        Assert.Equal(expected, SchedulerQueryService.ComputeAiConfigured(generator, verification, solution));
    }
}
