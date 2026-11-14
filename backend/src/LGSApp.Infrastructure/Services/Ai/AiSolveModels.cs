using LGSApp.Domain.Entities;

namespace LGSApp.Infrastructure.Services.Ai;

public enum AiSolveMode
{
    Blind = 1,
    Verified = 2
}

public sealed record AiSolveInput(
    string LessonName,
    string? TopicName,
    string? Text,
    string? OptionA,
    string? OptionB,
    string? OptionC,
    string? OptionD,
    byte[]? Image,
    int? VerifiedOption)
{
    public AiSolvePromptData ToPromptData(AiSolveMode mode) =>
        new(LessonName, TopicName, Text, OptionA, OptionB, OptionC, OptionD, Image is { Length: > 0 }, mode == AiSolveMode.Verified ? VerifiedOption : null);
}

public sealed record AiSolveResult(
    AiErrorKind ErrorKind,
    string? ErrorMessage,
    bool Readable,
    int Answer,
    string? Confidence,
    string? Solution,
    bool? AgreesWithKey,
    string? Model,
    string? Prompt,
    string? RawOutput,
    int? InputTokens,
    int? OutputTokens,
    int? ThinkingTokens,
    int? HttpStatus,
    int Attempts,
    int DurationMs,
    string? ModelVersion,
    TimeSpan? RetryAfter,
    string? FinishReason)
{
    public bool Succeeded => ErrorKind == AiErrorKind.None;

    public static AiSolveResult Failure(AiErrorKind kind, string? message, string? model = null, string? prompt = null, int attempts = 0, int durationMs = 0) =>
        new(kind, message, false, 0, null, null, null, model, prompt, null, null, null, null, null, attempts, durationMs, null, null, null);
}

public interface IAiSolver
{
    bool IsConfigured { get; }

    Task<AiSolveResult> SolveAsync(int questionId, AiSolveInput input, AiSolveMode mode, CancellationToken cancellationToken);
}

public static class AiErrorKindExtensions
{
    public static bool IsProviderFailure(this AiErrorKind kind) =>
        kind is AiErrorKind.RateLimited or AiErrorKind.QuotaExhausted or AiErrorKind.Unavailable or AiErrorKind.Timeout
            or AiErrorKind.AuthFailed or AiErrorKind.InvalidRequest or AiErrorKind.NotConfigured or AiErrorKind.Canceled;
}

public sealed class NotConfiguredAiSolver : IAiSolver
{
    public bool IsConfigured => false;

    public Task<AiSolveResult> SolveAsync(int questionId, AiSolveInput input, AiSolveMode mode, CancellationToken cancellationToken) =>
        Task.FromResult(AiSolveResult.Failure(AiErrorKind.NotConfigured, AiMessages.NotConfigured));
}
