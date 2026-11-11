using LGSApp.Domain.Entities;
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
    AssignmentStatus? AssignmentStatus,
    bool HasAnswered);

public sealed record QuestionAccess(
    QuestionAccessFacts Facts,
    bool IsVisible,
    bool IsOwner,
    bool CanSeeDiscussion,
    bool CanAnswer,
    bool CanReport,
    bool CanModerate);

public interface IQuestionAccessService
{
    Task<QuestionAccess?> GetAsync(int questionId, Actor actor, CancellationToken cancellationToken = default);
    Task<ServiceResult<QuestionAccess>> RequireDiscussionAsync(int questionId, Actor actor, string deniedMessage, CancellationToken cancellationToken = default);
}

public sealed class QuestionAccessService(AppDbContext db) : IQuestionAccessService
{
    public static QuestionAccess Evaluate(QuestionAccessFacts facts, Actor actor)
    {
        var isPublished = facts.AssignmentStatus is null
            ? facts.PublishedAt is not null
            : facts.AssignmentStatus is AssignmentStatus.Published or AssignmentStatus.Closed;
        var isVisible = actor.IsModerator || (isPublished && !facts.IsHidden);
        var isOwner = facts.AuthorUserId == actor.UserId;
        var canSeeDiscussion = isVisible
            && (actor.IsModerator || isOwner || facts.HasAnswered || facts.AssignmentStatus == AssignmentStatus.Closed);
        var canAnswer = actor.IsStudent
            && isVisible
            && facts.PublishedAt is not null
            && !facts.IsHidden
            && !isOwner
            && !facts.HasAnswered
            && facts.AssignmentStatus is null;
        var canReport = canSeeDiscussion && !isOwner && !actor.IsModerator;

        return new QuestionAccess(facts, isVisible, isOwner, canSeeDiscussion, canAnswer, canReport, actor.IsModerator);
    }

    public async Task<QuestionAccess?> GetAsync(int questionId, Actor actor, CancellationToken cancellationToken = default)
    {
        var userId = actor.UserId;
        var row = await db.Questions.AsNoTracking()
            .Where(q => q.Id == questionId)
            .Select(q => new
            {
                q.Id,
                q.AuthorUserId,
                q.Source,
                q.PublishedAt,
                q.IsHidden,
                AssignmentStatus = (
                    from aq in db.AssignmentQuestions
                    join a in db.Assignments on aq.AssignmentId equals a.Id
                    where aq.QuestionId == q.Id && !a.IsDeleted
                    select (AssignmentStatus?)a.Status).FirstOrDefault(),
                HasAnswered = db.Answers.Any(a => a.QuestionId == q.Id && a.UserId == userId)
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        var facts = new QuestionAccessFacts(row.Id, row.AuthorUserId, row.Source, row.PublishedAt, row.IsHidden, row.AssignmentStatus, row.HasAnswered);
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
            return Fail.Forbidden(deniedMessage);
        }

        return ServiceResult<QuestionAccess>.Ok(access);
    }
}
