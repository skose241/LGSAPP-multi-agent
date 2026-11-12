using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Likes;

public interface ILikeService
{
    Task<ServiceResult> LikeAsync(Actor actor, int questionId, CancellationToken cancellationToken = default);
    Task<ServiceResult> UnlikeAsync(Actor actor, int questionId, CancellationToken cancellationToken = default);
}

public sealed class LikeService(AppDbContext db, IQuestionAccessService access, TurkeyTime clock) : ILikeService
{
    private const string QuestionNotFound = "Soru bulunamadı.";

    public async Task<ServiceResult> LikeAsync(Actor actor, int questionId, CancellationToken cancellationToken = default)
    {
        var decision = await access.GetAsync(questionId, actor, cancellationToken);
        if (decision is null || !decision.IsVisible)
        {
            return Fail.NotFound(QuestionNotFound);
        }

        if (decision.IsOwner)
        {
            return Fail.Validation("Kendi sorunuzu beğenemezsiniz.");
        }

        var userId = actor.UserId;
        var createdAt = clock.UtcNow;
        try
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                INSERT INTO QuestionLikes (QuestionId, UserId, CreatedAt)
                SELECT {questionId}, {userId}, {createdAt}
                WHERE NOT EXISTS (
                    SELECT 1 FROM QuestionLikes WITH (UPDLOCK, HOLDLOCK)
                    WHERE QuestionId = {questionId} AND UserId = {userId})
                """,
                cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation())
        {
            return ServiceResult.Ok();
        }

        return ServiceResult.Ok();
    }

    public async Task<ServiceResult> UnlikeAsync(Actor actor, int questionId, CancellationToken cancellationToken = default)
    {
        var decision = await access.GetAsync(questionId, actor, cancellationToken);
        if (decision is null || !decision.IsVisible)
        {
            return Fail.NotFound(QuestionNotFound);
        }

        await db.QuestionLikes
            .Where(l => l.QuestionId == questionId && l.UserId == actor.UserId)
            .ExecuteDeleteAsync(cancellationToken);

        return ServiceResult.Ok();
    }
}
