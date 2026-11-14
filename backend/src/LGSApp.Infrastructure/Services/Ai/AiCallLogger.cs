using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Ai;

public sealed record AiLogCompletion(
    AiLogStatus Status,
    AiOperation Operation,
    AiErrorKind ErrorKind,
    string? ErrorMessage,
    int? HttpStatus,
    string? Model,
    string? ModelVersion,
    string? Input,
    string? Output,
    int? InputTokens,
    int? OutputTokens,
    int? ThinkingTokens,
    int? DurationMs,
    int AttemptCount,
    decimal? CostUsd,
    bool CountsTowardLimit,
    int? SolutionId,
    int? ImageFileId);

public interface IAiCallLogger
{
    Task CompleteAsync(long logId, AiLogCompletion completion, DateTime completedAtUtc, CancellationToken cancellationToken);
}

public sealed class AiCallLogger(AppDbContext db) : IAiCallLogger
{
    public const int OutputMaxLength = 16000;

    public static string BuildInput(string prompt, int? imageFileId, string? imageSha256)
    {
        var marker = imageFileId is null ? string.Empty : $"\n[görsel StoredFile#{imageFileId}, sha256={imageSha256}]";
        var room = Math.Max(0, AiRules.LogInputMaxLength - marker.Length);
        var body = prompt.Length <= room ? prompt : prompt[..room];
        return body + marker;
    }

    public static string ComputeSha256(byte[] bytes) =>
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant();

    public static string? Truncate(string? value, int max) =>
        value is { Length: > 0 } && value.Length > max ? value[..max] : value;

    public async Task CompleteAsync(long logId, AiLogCompletion c, DateTime completedAtUtc, CancellationToken cancellationToken)
    {
        var input = Truncate(c.Input, AiRules.LogInputMaxLength);
        var output = Truncate(c.Output, OutputMaxLength);
        var error = Truncate(c.ErrorMessage, AiRules.ErrorMessageMaxLength);
        var model = Truncate(c.Model, 50);
        var modelVersion = Truncate(c.ModelVersion, AiRules.ModelVersionMaxLength);
        var success = c.Status == AiLogStatus.Succeeded;
        var attempts = (byte)Math.Clamp(c.AttemptCount, 1, byte.MaxValue);
        short? http = c.HttpStatus is { } h ? (short)h : null;

        await db.AiLogs
            .Where(l => l.Id == logId)
            .ExecuteUpdateAsync(
                s => s.SetProperty(l => l.Status, c.Status)
                    .SetProperty(l => l.Success, success)
                    .SetProperty(l => l.Operation, c.Operation)
                    .SetProperty(l => l.ErrorKind, c.ErrorKind)
                    .SetProperty(l => l.ErrorMessage, error)
                    .SetProperty(l => l.HttpStatus, http)
                    .SetProperty(l => l.Model, model)
                    .SetProperty(l => l.ModelVersion, modelVersion)
                    .SetProperty(l => l.Input, input)
                    .SetProperty(l => l.Output, output)
                    .SetProperty(l => l.InputTokens, c.InputTokens)
                    .SetProperty(l => l.OutputTokens, c.OutputTokens)
                    .SetProperty(l => l.ThinkingTokens, c.ThinkingTokens)
                    .SetProperty(l => l.DurationMs, c.DurationMs)
                    .SetProperty(l => l.AttemptCount, attempts)
                    .SetProperty(l => l.CostUsd, c.CostUsd)
                    .SetProperty(l => l.CountsTowardLimit, c.CountsTowardLimit)
                    .SetProperty(l => l.SolutionId, c.SolutionId)
                    .SetProperty(l => l.ImageFileId, c.ImageFileId)
                    .SetProperty(l => l.CompletedAt, completedAtUtc),
                cancellationToken);
    }
}
