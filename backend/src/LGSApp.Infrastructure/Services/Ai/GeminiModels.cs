using System.Text.Json.Nodes;
using LGSApp.Domain.Entities;

namespace LGSApp.Infrastructure.Services.Ai;

public enum AiKeyPurpose
{
    Question = 1,
    Solution = 2
}

public abstract record GeminiPart
{
    public static GeminiPart Text(string text) => new GeminiTextPart(text);

    public static GeminiPart InlineImage(byte[] bytes, string mimeType) => new GeminiImagePart(bytes, mimeType);
}

public sealed record GeminiTextPart(string Value) : GeminiPart;

public sealed record GeminiImagePart(byte[] Bytes, string MimeType) : GeminiPart;

public sealed record GeminiRequest(
    string Model,
    string SystemInstruction,
    IReadOnlyList<GeminiPart> Parts,
    JsonNode ResponseJsonSchema,
    int MaxOutputTokens,
    string? ThinkingLevel,
    TimeSpan Timeout,
    int MaxAttempts,
    TimeSpan Max429Wait,
    TimeSpan TotalBudget,
    TimeSpan? RateLimitFallbackWait = null);

public sealed record GeminiCallResult(
    bool Succeeded,
    string? Json,
    string? FinishReason,
    int? InputTokens,
    int? OutputTokens,
    int? ThinkingTokens,
    int? HttpStatus,
    AiErrorKind ErrorKind,
    string? ErrorMessage,
    TimeSpan? RetryAfter,
    int Attempts,
    int DurationMs,
    string? ModelVersion,
    string? ResponseId)
{
    public static GeminiCallResult Failure(
        AiErrorKind kind,
        string? message,
        int attempts = 0,
        int durationMs = 0,
        int? httpStatus = null,
        TimeSpan? retryAfter = null,
        string? finishReason = null,
        int? inputTokens = null,
        int? outputTokens = null,
        int? thinkingTokens = null,
        string? modelVersion = null,
        string? responseId = null) =>
        new(false, null, finishReason, inputTokens, outputTokens, thinkingTokens, httpStatus, kind, message, retryAfter, attempts, durationMs, modelVersion, responseId);
}
