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
    IReadOnlyList<string> RecentQuestions);

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
    bool IsTransient = false)
{
    public static QuestionGenerationResult Failure(string error, bool isTransient = false, string? model = null, string? prompt = null, string? rawOutput = null, int? durationMs = null) =>
        new(false, Error: error, IsTransient: isTransient, Model: model, Prompt: prompt, RawOutput: rawOutput, DurationMs: durationMs);
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
        Task.FromResult(QuestionGenerationResult.Failure(SchedulerMessages.AiNotConfigured));
}

public sealed class FakeQuestionGenerator(IOptions<SchedulerOptions> options, TimeProvider timeProvider) : IQuestionGenerator
{
    public bool IsConfigured => true;

    public async Task<QuestionGenerationResult> GenerateAsync(QuestionGenerationRequest request, CancellationToken cancellationToken)
    {
        var fake = options.Value.FakeGenerator;
        if (fake.DelayMs > 0)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(fake.DelayMs), timeProvider, cancellationToken);
        }

        if (request.AttemptNo == 1 && fake.FailSlotSet.Contains(request.Slot))
        {
            return QuestionGenerationResult.Failure($"Sahte üretici bilerek hata verdi (slot {request.Slot}).", isTransient: true, model: "fake");
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
    public const string NoTopic = "Bu ders için tanımlı konu yok.";
    public const string GenerationDisabled = "Soru üretimi kapalı.";
    public const string GenerationDisabledManual = "Soru üretimi ayarlardan kapatılmış.";
    public const string AlreadyRunning = "Bu görev şu anda çalışıyor.";
    public const string LeaseExpired = "Kira süresi doldu, devralındı.";
}
