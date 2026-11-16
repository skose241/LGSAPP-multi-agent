using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Assignments;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Access;

public sealed record QuestionAccessFacts(
    int QuestionId,
    int AuthorUserId,
    QuestionSource Source,
    DateTime? PublishedAt,
    bool IsHidden,
    int? AssignmentId,
    AssignmentEffectiveState? AssignmentState,
    bool HasAnswered);

public sealed record QuestionAccess(
    QuestionAccessFacts Facts,
    bool IsVisible,
    bool IsOwner,
    bool CanSeeDiscussion,
    bool CanSeeOwnResult,
    bool CanAnswer,
    bool CanReport,
    bool CanModerate,
    bool IsHiddenOwnerView = false);

public interface IQuestionAccessService
{
    Task<QuestionAccess?> GetAsync(int questionId, Actor actor, CancellationToken cancellationToken = default);
    Task<ServiceResult<QuestionAccess>> RequireDiscussionAsync(int questionId, Actor actor, string deniedMessage, CancellationToken cancellationToken = default);
}

public sealed class QuestionAccessService(AppDbContext db, TurkeyTime clock) : IQuestionAccessService
{
    public const string AssignmentDiscussionClosedMessage = "Tartışma ödev kapandıktan sonra açılır.";

    public static QuestionAccess Evaluate(QuestionAccessFacts facts, Actor actor)
    {
        var isPublished = facts.AssignmentState is null
            ? facts.PublishedAt is not null
            : facts.AssignmentState is AssignmentEffectiveState.Open or AssignmentEffectiveState.Closed;
        var isVisible = actor.IsModerator || (isPublished && !facts.IsHidden);
        var isOwner = facts.AuthorUserId == actor.UserId;
        var assignmentOpen = facts.AssignmentState == AssignmentEffectiveState.Open;
        var canSeeDiscussion = isVisible
            && (actor.IsModerator
                || facts.AssignmentState == AssignmentEffectiveState.Closed
                || (!assignmentOpen && (isOwner || facts.HasAnswered)));
        var canSeeOwnResult = isVisible
            && (canSeeDiscussion || (assignmentOpen && facts.HasAnswered));
        var canAnswer = actor.IsStudent
            && isVisible
            && !facts.IsHidden
            && !isOwner
            && !facts.HasAnswered
            && (facts.AssignmentState is null ? facts.PublishedAt is not null : facts.AssignmentState == AssignmentEffectiveState.Open);
        var canReport = isVisible && !isOwner && !actor.IsModerator;

        var hiddenOwnerView = actor.IsStudent && isOwner && facts.IsHidden;

        return new QuestionAccess(facts, isVisible, isOwner, canSeeDiscussion, canSeeOwnResult, canAnswer, canReport, actor.IsModerator, hiddenOwnerView);
    }

    public async Task<QuestionAccess?> GetAsync(int questionId, Actor actor, CancellationToken cancellationToken = default)
    {
        var userId = actor.UserId;
        var today = clock.Today;
        var row = await db.Questions.AsNoTracking()
            .Where(q => q.Id == questionId)
            .Select(q => new
            {
                q.Id,
                q.AuthorUserId,
                q.Source,
                q.PublishedAt,
                q.IsHidden,
                Assignment = (
                    from aq in db.AssignmentQuestions
                    join a in db.Assignments on aq.AssignmentId equals a.Id
                    where aq.QuestionId == q.Id && !a.IsDeleted
                    select new { a.Id, a.Status, a.StartDate, a.EndDate }).FirstOrDefault(),
                HasAnswered = db.Answers.Any(a => a.QuestionId == q.Id && a.UserId == userId)
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        AssignmentEffectiveState? state = row.Assignment is null
            ? null
            : AssignmentState.Compute(row.Assignment.Status, row.Assignment.StartDate, row.Assignment.EndDate, today);
        var facts = new QuestionAccessFacts(row.Id, row.AuthorUserId, row.Source, row.PublishedAt, row.IsHidden, row.Assignment?.Id, state, row.HasAnswered);
        return Evaluate(facts, actor);
    }

    public async Task<ServiceResult<QuestionAccess>> RequireDiscussionAsync(int questionId, Actor actor, string deniedMessage, CancellationToken cancellationToken = default)
    {
        var access = await GetAsync(questionId, actor, cancellationToken);
        if (access is null || !access.IsVisible)
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        if (!access.CanSeeDiscussion)
        {
            return Fail.Forbidden(access.Facts.AssignmentState == AssignmentEffectiveState.Open ? AssignmentDiscussionClosedMessage : deniedMessage);
        }

        return ServiceResult<QuestionAccess>.Ok(access);
    }
}
