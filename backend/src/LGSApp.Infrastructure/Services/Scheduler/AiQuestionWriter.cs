using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Ai;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Scheduler;

public sealed record SlotContext(
    int RunId,
    DateOnly RunDate,
    int AiUserId,
    int LessonId,
    int? TopicId,
    TopicSource TopicSource,
    byte Slot,
    int AttemptNo);

public enum SlotWriteStatus
{
    Written = 1,
    Skipped = 2
}

public sealed record SlotWriteOutcome(SlotWriteStatus Status, int? QuestionId);

public interface IAiQuestionWriter
{
    Task<SlotWriteOutcome> WriteSuccessAsync(SlotContext slot, QuestionGenerationResult result, ValidatedQuestion question, QuestionVerification? verification, CancellationToken cancellationToken);
    Task WriteFailureAsync(SlotContext slot, string error, QuestionGenerationResult? result, QuestionVerification? verification, CancellationToken cancellationToken);
    Task WriteSkippedAsync(SlotContext slot, string reason, CancellationToken cancellationToken);
}

public sealed class AiQuestionWriter(AppDbContext db, TurkeyTime clock) : IAiQuestionWriter
{
    private const int ErrorMaxLength = 2000;
    private const int LogTextMaxLength = 4000;

    public async Task<SlotWriteOutcome> WriteSuccessAsync(SlotContext slot, QuestionGenerationResult result, ValidatedQuestion question, QuestionVerification? verification, CancellationToken cancellationToken)
    {
        try
        {
            return await db.ExecuteInTransactionAsync(async token =>
            {
                var taken = await db.Questions.AnyAsync(
                    q => q.Source == QuestionSource.Ai && q.LessonId == slot.LessonId && q.GenerationDate == slot.RunDate && q.GenerationSlot == slot.Slot,
                    token);
                if (taken)
                {
                    return new SlotWriteOutcome(SlotWriteStatus.Skipped, null);
                }

                var now = clock.UtcNow;
                var entity = new Question
                {
                    AuthorUserId = slot.AiUserId,
                    LessonId = slot.LessonId,
                    TopicId = slot.TopicId,
                    Source = QuestionSource.Ai,
                    Text = question.Text,
                    OptionA = question.OptionA,
                    OptionB = question.OptionB,
                    OptionC = question.OptionC,
                    OptionD = question.OptionD,
                    CorrectOption = question.CorrectOption,
                    Description = null,
                    GenerationDate = slot.RunDate,
                    GenerationSlot = slot.Slot,
                    PublishedAt = null,
                    CreatedAt = now
                };
                db.Questions.Add(entity);
                await db.SaveChangesAsync(token);

                db.Solutions.Add(new Solution
                {
                    QuestionId = entity.Id,
                    AuthorUserId = slot.AiUserId,
                    Type = SolutionType.Ai,
                    StatedOption = question.CorrectOption,
                    Text = AiQuestionValidator.BuildSolutionText(question.CorrectOption, question.Explanation),
                    CreatedAt = now
                });
                db.GenerationLogs.Add(new GenerationLog
                {
                    RunId = slot.RunId,
                    RunDate = slot.RunDate,
                    LessonId = slot.LessonId,
                    TopicId = slot.TopicId,
                    Slot = slot.Slot,
                    AttemptNo = slot.AttemptNo,
                    Status = GenerationLogStatus.Success,
                    QuestionId = entity.Id,
                    CreatedAt = now
                });
                db.AiLogs.Add(new AiLog
                {
                    QuestionId = entity.Id,
                    Operation = AiOperation.QuestionGeneration,
                    Model = Truncate(result.Model, 50),
                    Input = Truncate(result.Prompt, LogTextMaxLength),
                    Output = result.RawOutput,
                    InputTokens = result.InputTokens,
                    OutputTokens = result.OutputTokens,
                    ThinkingTokens = result.ThinkingTokens,
                    CostUsd = result.CostUsd,
                    DurationMs = result.DurationMs,
                    AttemptCount = ClampAttempts(result.AttemptCount),
                    HttpStatus = (short?)result.HttpStatus,
                    ModelVersion = Truncate(result.ModelVersion, AiRules.ModelVersionMaxLength),
                    Success = true,
                    Status = AiLogStatus.Succeeded,
                    CompletedAt = now,
                    CreatedAt = now
                });
                if (BuildVerificationLog(verification, entity.Id, now) is { } verificationLog)
                {
                    db.AiLogs.Add(verificationLog);
                }

                await db.SaveChangesAsync(token);

                if (slot is { TopicSource: TopicSource.Plan, TopicId: { } topicId })
                {
                    await db.DailyTopicPlans
                        .Where(p => p.PlanDate == slot.RunDate && p.LessonId == slot.LessonId && p.TopicId == topicId && p.UsedAt == null)
                        .ExecuteUpdateAsync(s => s.SetProperty(p => p.UsedAt, now), token);
                }

                return new SlotWriteOutcome(SlotWriteStatus.Written, entity.Id);
            }, cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation())
        {
            db.ChangeTracker.Clear();
            return new SlotWriteOutcome(SlotWriteStatus.Skipped, null);
        }
    }

    public async Task WriteFailureAsync(SlotContext slot, string error, QuestionGenerationResult? result, QuestionVerification? verification, CancellationToken cancellationToken)
    {
        db.ChangeTracker.Clear();
        var now = clock.UtcNow;
        db.GenerationLogs.Add(new GenerationLog
        {
            RunId = slot.RunId,
            RunDate = slot.RunDate,
            LessonId = slot.LessonId,
            TopicId = slot.TopicId,
            Slot = slot.Slot,
            AttemptNo = slot.AttemptNo,
            Status = GenerationLogStatus.Failed,
            ErrorMessage = Truncate(error, ErrorMaxLength),
            CreatedAt = now
        });
        if (BuildGenerationFailureLog(result, error, now) is { } generationLog)
        {
            db.AiLogs.Add(generationLog);
        }

        if (BuildVerificationLog(verification, null, now) is { } verificationLog)
        {
            db.AiLogs.Add(verificationLog);
        }

        await db.SaveChangesAsync(cancellationToken);
        db.ChangeTracker.Clear();
    }

    public async Task WriteSkippedAsync(SlotContext slot, string reason, CancellationToken cancellationToken)
    {
        db.ChangeTracker.Clear();
        db.GenerationLogs.Add(new GenerationLog
        {
            RunId = slot.RunId,
            RunDate = slot.RunDate,
            LessonId = slot.LessonId,
            TopicId = slot.TopicId,
            Slot = slot.Slot,
            AttemptNo = slot.AttemptNo,
            Status = GenerationLogStatus.Skipped,
            ErrorMessage = Truncate(reason, ErrorMaxLength),
            CreatedAt = clock.UtcNow
        });
        await db.SaveChangesAsync(cancellationToken);
        db.ChangeTracker.Clear();
    }

    public static bool HasProviderCall(int attemptCount) => attemptCount > 0;

    public static AiLog? BuildGenerationFailureLog(QuestionGenerationResult? result, string error, DateTime now)
    {
        if (result is null || !HasProviderCall(result.AttemptCount))
        {
            return null;
        }

        var rejected = result.Succeeded;
        return new AiLog
        {
            Operation = AiOperation.QuestionGeneration,
            Model = Truncate(result.Model, 50),
            Input = Truncate(result.Prompt, LogTextMaxLength),
            Output = result.RawOutput ?? Truncate(error, ErrorMaxLength),
            InputTokens = result.InputTokens,
            OutputTokens = result.OutputTokens,
            ThinkingTokens = result.ThinkingTokens,
            CostUsd = result.CostUsd,
            DurationMs = result.DurationMs,
            AttemptCount = ClampAttempts(result.AttemptCount),
            HttpStatus = (short?)result.HttpStatus,
            ModelVersion = Truncate(result.ModelVersion, AiRules.ModelVersionMaxLength),
            Success = false,
            Status = rejected ? AiLogStatus.Rejected : AiLogStatus.Failed,
            ErrorKind = rejected && result.ErrorKind == AiErrorKind.None ? AiErrorKind.InvalidOutput : result.ErrorKind,
            ErrorMessage = AiErrorText.Sanitize(result.RawError) ?? Truncate(error, ErrorMaxLength),
            CompletedAt = now,
            CreatedAt = now
        };
    }

    public static AiLog? BuildVerificationLog(QuestionVerification? v, int? questionId, DateTime now)
    {
        if (v is null || !HasProviderCall(v.AttemptCount))
        {
            return null;
        }

        return new AiLog
        {
            QuestionId = questionId,
            Operation = AiOperation.SolutionVerification,
            Model = Truncate(v.Model, 50),
            Input = Truncate(v.Prompt, LogTextMaxLength),
            Output = v.RawOutput,
            InputTokens = v.InputTokens,
            OutputTokens = v.OutputTokens,
            ThinkingTokens = v.ThinkingTokens,
            CostUsd = v.CostUsd,
            DurationMs = v.DurationMs,
            AttemptCount = ClampAttempts(v.AttemptCount),
            HttpStatus = (short?)v.HttpStatus,
            ModelVersion = Truncate(v.ModelVersion, AiRules.ModelVersionMaxLength),
            Success = v.Status == AiLogStatus.Succeeded,
            Status = v.Status,
            ErrorKind = v.ErrorKind,
            ErrorMessage = AiErrorText.Sanitize(v.RawError) ?? Truncate(v.Error, ErrorMaxLength),
            CompletedAt = now,
            CreatedAt = now
        };
    }

    private static byte ClampAttempts(int attempts) => (byte)Math.Clamp(attempts, 1, byte.MaxValue);

    private static string? Truncate(string? value, int max) =>
        value is { Length: > 0 } && value.Length > max ? value[..max] : value;
}
