using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Ai;
using LGSApp.Infrastructure.Services.Scheduler;
using LGSApp.Infrastructure.Services.Settings;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Ai;

public class QuestionVerifierTests
{
    private sealed class StubSettings(int value) : ISettingsService
    {
        public Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default) =>
            Task.FromResult(key == SettingKeys.AiSoruDogrulamaAktifMi ? value : 0);

        public void Invalidate()
        {
        }
    }

    private sealed class StubSolver(AiSolveResult result, bool configured = true) : IAiSolver
    {
        public bool IsConfigured => configured;

        public int Calls { get; private set; }

        public AiSolveInput? LastInput { get; private set; }

        public AiSolveMode? LastMode { get; private set; }

        public Task<AiSolveResult> SolveAsync(int questionId, AiSolveInput input, AiSolveMode mode, CancellationToken cancellationToken)
        {
            Calls++;
            LastInput = input;
            LastMode = mode;
            return Task.FromResult(result);
        }
    }

    private static readonly QuestionGenerationRequest Request = new(7, "Matematik", 11, "Üslü Sayılar", 1, 1, []);

    private static readonly ValidatedQuestion Question = new("2 üzeri 3 kaçtır?", "6", "8", "9", "12", 2, new string('e', 60));

    private static AiSolveResult Solved(int answer, string confidence = "high", bool readable = true, string? solution = null) =>
        new(AiErrorKind.None, null, readable, answer, confidence, solution ?? new string('s', 70), null, "gemini-3.8-flash", "p", "{}", 100, 50, 20, 200, 1, 900, "v1", null, "STOP");

    private static QuestionVerifier Create(IAiSolver solver, int setting = 1, bool verifyEnabled = true, AiProvider provider = AiProvider.Gemini, AiProviderGate? gate = null)
    {
        var options = AiTestData.GeminiOptions();
        options.Provider = provider;
        options.Question.VerifyEnabled = verifyEnabled;
        options.Pricing["gemini-3.8-flash"] = new AiPricingOptions { InputPerMTokUsd = 1m, OutputPerMTokUsd = 2m };
        return new QuestionVerifier(solver, new StubSettings(setting), Options.Create(options), new AiCostCalculator(Options.Create(options)),
            gate ?? new AiProviderGate(TimeProvider.System, Options.Create(options)));
    }

    [Theory]
    [InlineData(1, true, AiProvider.Gemini, true)]
    [InlineData(0, true, AiProvider.Gemini, false)]
    [InlineData(1, false, AiProvider.Gemini, false)]
    [InlineData(1, true, AiProvider.Fake, false)]
    [InlineData(1, true, AiProvider.None, false)]
    public async Task Enabled_requires_setting_option_and_gemini_provider(int setting, bool option, AiProvider provider, bool expected)
    {
        var verifier = Create(new StubSolver(Solved(2)), setting, option, provider);

        Assert.Equal(expected, await verifier.IsEnabledAsync(CancellationToken.None));
    }

    [Fact]
    public async Task Matching_answer_passes_using_blind_mode_without_key_or_image()
    {
        var solver = new StubSolver(Solved(2));

        var result = await Create(solver).VerifyAsync(Request, Question, CancellationToken.None);

        Assert.True(result.Passed);
        Assert.Equal(AiLogStatus.Succeeded, result.Status);
        Assert.Equal(AiSolveMode.Blind, solver.LastMode);
        Assert.Null(solver.LastInput!.VerifiedOption);
        Assert.Null(solver.LastInput.Image);
        Assert.Equal("Üslü Sayılar", solver.LastInput.TopicName);
        Assert.Equal(Math.Round((100 * 1m + 70 * 2m) / 1_000_000m, 6), result.CostUsd);
        Assert.Equal(20, result.ThinkingTokens);
    }

    [Theory]
    [InlineData(3, "high")]
    [InlineData(3, "medium")]
    [InlineData(3, "low")]
    public async Task Different_answer_is_rejected_as_mismatch(int answer, string confidence)
    {
        var result = await Create(new StubSolver(Solved(answer, confidence))).VerifyAsync(Request, Question, CancellationToken.None);

        Assert.False(result.Passed);
        Assert.Equal(SchedulerMessages.VerificationMismatch, result.Error);
        Assert.Equal(AiLogStatus.Rejected, result.Status);
        Assert.NotNull(result.CostUsd);
    }

    [Fact]
    public async Task Same_answer_with_low_confidence_is_rejected()
    {
        var result = await Create(new StubSolver(Solved(2, "low"))).VerifyAsync(Request, Question, CancellationToken.None);

        Assert.False(result.Passed);
        Assert.Equal(SchedulerMessages.VerificationLowConfidence, result.Error);
    }

    [Fact]
    public async Task Unreadable_is_rejected()
    {
        var result = await Create(new StubSolver(Solved(0, "low", readable: false))).VerifyAsync(Request, Question, CancellationToken.None);

        Assert.False(result.Passed);
        Assert.Equal(SchedulerMessages.VerificationUnreadable, result.Error);
        Assert.Equal(AiErrorKind.Unreadable, result.ErrorKind);
    }

    [Fact]
    public async Task Short_solution_is_unreliable()
    {
        var result = await Create(new StubSolver(Solved(2, solution: "kısa"))).VerifyAsync(Request, Question, CancellationToken.None);

        Assert.False(result.Passed);
        Assert.Equal(SchedulerMessages.VerificationUnreliable, result.Error);
    }

    [Theory]
    [InlineData(AiErrorKind.Unavailable, "Doğrulama çağrısı başarısız: Yapay zekâ şu anda yanıt vermiyor.")]
    [InlineData(AiErrorKind.Timeout, "Doğrulama çağrısı başarısız: Yapay zekâ yanıt vermedi (zaman aşımı).")]
    [InlineData(AiErrorKind.RateLimited, "Doğrulama çağrısı başarısız: Yapay zekâ istek sınırına takıldı.")]
    [InlineData(AiErrorKind.InvalidRequest, "Doğrulama çağrısı başarısız: Yapay zekâ isteği geçersiz.")]
    [InlineData(AiErrorKind.Canceled, "Doğrulama çağrısı başarısız.")]
    [InlineData(AiErrorKind.QuotaExhausted, "Yapay zekâ günlük kotası doldu.")]
    [InlineData(AiErrorKind.AuthFailed, "Yapay zekâ anahtarı geçersiz.")]
    public async Task Provider_failure_is_a_failed_slot_with_its_kind(AiErrorKind kind, string message)
    {
        var failure = AiSolveResult.Failure(kind, "boom", "gemini-3.8-flash", "p", 2, 1500);

        var result = await Create(new StubSolver(failure)).VerifyAsync(Request, Question, CancellationToken.None);

        Assert.False(result.Passed);
        Assert.Equal(kind, result.ErrorKind);
        Assert.Equal(message, result.Error);
        Assert.DoesNotContain("boom", result.Error);
        Assert.Equal("boom", result.RawError);
        Assert.Equal(AiLogStatus.Failed, result.Status);
        Assert.Equal(2, result.AttemptCount);
    }

    [Fact]
    public async Task Unconfigured_solver_fails_with_not_configured()
    {
        var solver = new StubSolver(Solved(2), configured: false);

        var result = await Create(solver).VerifyAsync(Request, Question, CancellationToken.None);

        Assert.False(result.Passed);
        Assert.Equal(AiErrorKind.NotConfigured, result.ErrorKind);
        Assert.Equal(0, solver.Calls);
    }
}
