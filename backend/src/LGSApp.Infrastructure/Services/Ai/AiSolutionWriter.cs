using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Notifications;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Ai;

public sealed record AiWriteRequest(
    int QuestionId,
    long LogId,
    int AiUserId,
    AiSolveResult Result,
    AiSolveMode Mode,
    int KeyAtCall,
    string LogInput,
    int? ImageFileId,
    decimal? CostUsd);

public enum AiWriteKind
{
    Created = 1,
    UnderReview = 2,
    Unreadable = 3,
    Unreliable = 4,
    Duplicate = 5,
    Stale = 6
}

public sealed record AiWriteOutcome(AiWriteKind Kind, int? SolutionId);

public interface IAiSolutionWriter
{
    Task<AiWriteOutcome> WriteAsync(AiWriteRequest request, CancellationToken cancellationToken);
}

public sealed class AiSolutionWriter(
    AppDbContext db,
    IAiCallLogger logger,
    INotificationService notifications,
    TurkeyTime clock) : IAiSolutionWriter
{
    public async Task<AiWriteOutcome> WriteAsync(AiWriteRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return await db.ExecuteInTransactionAsync(token => WriteCoreAsync(request, token), cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation())
        {
            db.ChangeTracker.Clear();
            return await CompleteDuplicateAsync(request, cancellationToken);
        }
    }

    private async Task<AiWriteOutcome> WriteCoreAsync(AiWriteRequest request, CancellationToken token)
    {
        var questionId = request.QuestionId;
        var question = await db.Questions
            .FromSqlInterpolated($"SELECT * FROM [Questions] WITH (UPDLOCK, ROWLOCK) WHERE [Id] = {questionId}")
            .FirstOrDefaultAsync(token);
        var now = clock.UtcNow;

        if (question is null || question.CorrectOption != request.KeyAtCall)
        {
            await CompleteAsync(
                request, AiLogStatus.Failed, AiOperation.Solution, AiErrorKind.Unavailable,
                "Çözüm üretilirken soru değişti veya silindi; sonuç kaydedilmedi.", false, null, now, token);
            return new AiWriteOutcome(AiWriteKind.Stale, null);
        }

        var classification = AiSolveClassifier.Classify(request.Result, request.Mode, question.CorrectOption);

        switch (classification.Outcome)
        {
            case AiSolveOutcome.Accepted:
            case AiSolveOutcome.Mismatch:
                break;
            case AiSolveOutcome.Unreadable:
                await CompleteAsync(request, AiLogStatus.Rejected, AiOperation.SolutionInvalid, AiErrorKind.Unreadable, classification.Reason, true, null, now, token);
                return new AiWriteOutcome(AiWriteKind.Unreadable, null);
            default:
                await CompleteAsync(
                    request, AiLogStatus.Rejected,
                    classification.KeyDisagreement ? AiOperation.AnswerMismatch : AiOperation.SolutionInvalid,
                    classification.ErrorKind, classification.Reason, true, null, now, token);
                return new AiWriteOutcome(AiWriteKind.Unreliable, null);
        }

        var existingId = await db.Solutions.AsNoTracking()
            .Where(s => s.QuestionId == questionId && s.Type == SolutionType.Ai && !s.IsDeleted)
            .Select(s => (int?)s.Id)
            .FirstOrDefaultAsync(token);
        if (existingId is not null)
        {
            await CompleteAsync(request, AiLogStatus.Rejected, AiOperation.Solution, AiErrorKind.None, AiMessages.DuplicateNote, false, null, now, token);
            return new AiWriteOutcome(AiWriteKind.Duplicate, existingId);
        }

        var mismatch = classification.Outcome == AiSolveOutcome.Mismatch;
        var solution = new Solution
        {
            QuestionId = questionId,
            AuthorUserId = request.AiUserId,
            Type = SolutionType.Ai,
            StatedOption = (byte)classification.Option,
            Text = classification.SolutionText,
            IsHidden = mismatch,
            CreatedAt = now
        };
        db.Solutions.Add(solution);

        if (mismatch)
        {
            question.IsAnswerDisputed = true;
            question.AnswerDisputedAt = now;
            question.AiSuggestedOption = (byte)classification.Option;
            await NotifyDisputeAsync(question, classification.Option, token);
        }

        await db.SaveChangesAsync(token);

        await CompleteAsync(
            request, AiLogStatus.Succeeded,
            mismatch ? AiOperation.AnswerMismatch : AiOperation.Solution,
            AiErrorKind.None, null, true, solution.Id, now, token);
        return new AiWriteOutcome(mismatch ? AiWriteKind.UnderReview : AiWriteKind.Created, solution.Id);
    }

    private async Task NotifyDisputeAsync(Question question, int option, CancellationToken token)
    {
        var recipients = await (
            from u in db.Users.AsNoTracking()
            join ur in db.UserRoles on u.Id equals ur.UserId
            where ur.RoleId == Roles.OgretmenId && u.BranchLessonId == question.LessonId && !u.IsBanned
            select u.Id).Distinct().ToListAsync(token);

        if (recipients.Count == 0)
        {
            recipients = await (
                from u in db.Users.AsNoTracking()
                join ur in db.UserRoles on u.Id equals ur.UserId
                where ur.RoleId == Roles.MudurId && !u.IsBanned
                select u.Id).Distinct().ToListAsync(token);
        }

        var message = string.Format(System.Globalization.CultureInfo.InvariantCulture, AiMessages.DisputeNotification, AiPrompts.Letter(option));
        foreach (var recipient in recipients)
        {
            await notifications.NotifyAsync(
                new NotificationDraft(recipient, NotificationType.AnswerDisputed, message, QuestionId: question.Id),
                true,
                token);
        }
    }

    private async Task<AiWriteOutcome> CompleteDuplicateAsync(AiWriteRequest request, CancellationToken token)
    {
        var existingId = await db.Solutions.AsNoTracking()
            .Where(s => s.QuestionId == request.QuestionId && s.Type == SolutionType.Ai && !s.IsDeleted)
            .Select(s => (int?)s.Id)
            .FirstOrDefaultAsync(token);
        await CompleteAsync(request, AiLogStatus.Rejected, AiOperation.Solution, AiErrorKind.None, AiMessages.DuplicateNote, false, null, clock.UtcNow, token);
        return new AiWriteOutcome(AiWriteKind.Duplicate, existingId);
    }

    private Task CompleteAsync(
        AiWriteRequest request,
        AiLogStatus status,
        AiOperation operation,
        AiErrorKind errorKind,
        string? message,
        bool countsTowardLimit,
        int? solutionId,
        DateTime now,
        CancellationToken token)
    {
        var r = request.Result;
        return logger.CompleteAsync(
            request.LogId,
            new AiLogCompletion(
                status, operation, errorKind, message, r.HttpStatus, r.Model, r.ModelVersion, request.LogInput, r.RawOutput,
                r.InputTokens, r.OutputTokens, r.ThinkingTokens, r.DurationMs, Math.Max(1, r.Attempts), request.CostUsd,
                countsTowardLimit, solutionId, request.ImageFileId),
            now,
            token);
    }
}
