using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Scheduler;

public sealed record QuestionGenerationRequest(
    int LessonId,
    string LessonName,
    int TopicId,
    string TopicName,
    byte Slot,
    int AttemptNo,
    IReadOnlyList<string> RecentQuestions,
    int TargetOption = 0,
    DateTime? DeadlineUtc = null);

public sealed record QuestionGenerationResult(
    bool Succeeded,
    string? Text = null,
    string? OptionA = null,
    string? OptionB = null,
    string? OptionC = null,
    string? OptionD = null,
    int CorrectOption = 0,
    string? Explanation = null,
    string? Model = null,
    string? Prompt = null,
    string? RawOutput = null,
    int? InputTokens = null,
    int? OutputTokens = null,
    int? DurationMs = null,
    string? Error = null,
    bool IsTransient = false,
    AiErrorKind ErrorKind = AiErrorKind.None,
    int? ThinkingTokens = null,
    decimal? CostUsd = null,
    int AttemptCount = 1,
    string? ModelVersion = null,
    int? HttpStatus = null,
    string? Topic = null,
    string? RawError = null)
{
    public static QuestionGenerationResult Failure(
        string error,
        bool isTransient = false,
        string? model = null,
        string? prompt = null,
        string? rawOutput = null,
        int? durationMs = null,
        AiErrorKind errorKind = AiErrorKind.None,
        int? inputTokens = null,
        int? outputTokens = null,
        int? thinkingTokens = null,
        decimal? costUsd = null,
        int attemptCount = 1,
        string? modelVersion = null,
        int? httpStatus = null,
        string? rawError = null) =>
        new(false, Error: error, IsTransient: isTransient, Model: model, Prompt: prompt, RawOutput: rawOutput, DurationMs: durationMs,
            ErrorKind: errorKind, InputTokens: inputTokens, OutputTokens: outputTokens, ThinkingTokens: thinkingTokens, CostUsd: costUsd,
            AttemptCount: attemptCount, ModelVersion: modelVersion, HttpStatus: httpStatus, RawError: rawError);
}

public interface IQuestionGenerator
{
    bool IsConfigured { get; }

    Task<QuestionGenerationResult> GenerateAsync(QuestionGenerationRequest request, CancellationToken cancellationToken);
}

public sealed class NotConfiguredQuestionGenerator : IQuestionGenerator
{
    public bool IsConfigured => false;

    public Task<QuestionGenerationResult> GenerateAsync(QuestionGenerationRequest request, CancellationToken cancellationToken) =>
        Task.FromResult(QuestionGenerationResult.Failure(SchedulerMessages.AiNotConfigured, errorKind: AiErrorKind.NotConfigured, attemptCount: 0));
}

public sealed class FakeQuestionGenerator(IOptions<AiOptions> options, TimeProvider timeProvider) : IQuestionGenerator
{
    public bool IsConfigured => true;

    public async Task<QuestionGenerationResult> GenerateAsync(QuestionGenerationRequest request, CancellationToken cancellationToken)
    {
        var fake = options.Value.Fake;
        if (fake.DelayMs > 0)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(fake.DelayMs), timeProvider, cancellationToken);
        }

        if (request.AttemptNo == 1 && fake.FailSlotSet.Contains(request.Slot))
        {
            var kind = fake.FailKind;
            var message = kind == AiErrorKind.None
                ? $"Sahte üretici bilerek hata verdi (slot {request.Slot})."
                : SchedulerMessages.ForErrorKind(kind, null);
            return QuestionGenerationResult.Failure(message, isTransient: kind == AiErrorKind.None, model: "fake", errorKind: kind);
        }

        var correct = (request.Slot + request.LessonId) % 4 + 1;
        var text = $"[Test] {request.LessonName} - {request.TopicName}: {request.Slot}. soru. Aşağıdakilerden hangisi doğrudur?";
        var letter = (char)('A' + correct - 1);
        return new QuestionGenerationResult(
            true,
            text,
            "Birinci seçenek",
            "İkinci seçenek",
            "Üçüncü seçenek",
            "Dördüncü seçenek",
            correct,
            $"Bu bir test sorusudur. Doğru seçenek {letter} şıkkıdır ve açıklama en az elli karakter olacak biçimde yazılmıştır.",
            "fake",
            $"fake:{request.LessonId}:{request.TopicId}:{request.Slot}",
            "{}",
            0,
            0,
            Math.Max(0, fake.DelayMs));
    }
}

public static class SchedulerMessages
{
    public const string AiNotConfigured = "Yapay zekâ yapılandırılmadı.";
    public const string AiQuotaExhausted = "Yapay zekâ günlük kotası doldu.";
    public const string AiAuthFailed = "Yapay zekâ anahtarı geçersiz.";
    public const string VerificationMismatch = "Doğrulama başarısız: yapay zekâ farklı şık buldu.";
    public const string VerificationLowConfidence = "Doğrulama başarısız: yapay zekâ cevaptan emin olamadı.";
    public const string VerificationUnreadable = "Doğrulama başarısız: yapay zekâ soruyu okuyamadı.";
    public const string VerificationUnreliable = "Doğrulama başarısız: yapay zekâ güvenilir bir çözüm üretemedi.";
    public const string VerificationNotConfigured = "Doğrulama yapılamadı: yapay zekâ çözüm anahtarı yapılandırılmadı.";
    public const string AiUnavailable = "Yapay zekâ şu anda yanıt vermiyor.";
    public const string AiTimeout = "Yapay zekâ yanıt vermedi (zaman aşımı).";
    public const string AiRateLimited = "Yapay zekâ istek sınırına takıldı.";
    public const string AiBlocked = "Yanıt engellendi.";
    public const string AiTruncated = "Yanıt yarım kaldı.";
    public const string AiInvalidOutput = "Yanıt beklenen biçimde değil.";
    public const string AiInvalidRequest = "Yapay zekâ isteği geçersiz.";
    public const string VerificationCallFailedPrefix = "Doğrulama çağrısı başarısız";
    public const string NoTopic = "Bu ders için tanımlı konu yok.";
    public const string GenerationDisabled = "Soru üretimi kapalı.";
    public const string GenerationDisabledManual = "Soru üretimi ayarlardan kapatılmış.";
    public const string AlreadyRunning = "Bu görev şu anda çalışıyor.";
    public const string LeaseExpired = "Kira süresi doldu, devralındı.";

    public static string? TryForErrorKind(AiErrorKind kind) => kind switch
    {
        AiErrorKind.QuotaExhausted => AiQuotaExhausted,
        AiErrorKind.AuthFailed => AiAuthFailed,
        AiErrorKind.NotConfigured => AiNotConfigured,
        AiErrorKind.Unavailable => AiUnavailable,
        AiErrorKind.Timeout => AiTimeout,
        AiErrorKind.RateLimited => AiRateLimited,
        AiErrorKind.Blocked => AiBlocked,
        AiErrorKind.Truncated => AiTruncated,
        AiErrorKind.InvalidOutput => AiInvalidOutput,
        AiErrorKind.InvalidRequest => AiInvalidRequest,
        _ => null
    };

    public static string ForErrorKind(AiErrorKind kind, string? fallback) =>
        TryForErrorKind(kind) ?? (string.IsNullOrWhiteSpace(fallback) ? "Soru üretilemedi." : fallback);

    public static string ForVerificationFailure(AiErrorKind kind) =>
        kind is AiErrorKind.QuotaExhausted or AiErrorKind.AuthFailed or AiErrorKind.NotConfigured
            ? ForErrorKind(kind, null)
            : TryForErrorKind(kind) is { } known ? $"{VerificationCallFailedPrefix}: {known}" : $"{VerificationCallFailedPrefix}.";
}
