using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Ai;
using LGSApp.Infrastructure.Services.Assignments;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Questions;

public sealed record LessonRefView(int Id, string Name);

public sealed record TopicRefView(int Id, string Name);

public sealed record QuestionOptionsView(string? A, string? B, string? C, string? D);

public sealed record QuestionStatsView(int AnswerCount, int CorrectCount, int SolutionCount, int CommentCount);

public sealed record MyAnswerView(byte SelectedOption, bool IsCorrect, DateTime AnsweredAt, int? SolutionId);

public sealed record QuestionPermissionsView(bool CanAnswer, bool CanSeeDiscussion, bool CanSeeOwnResult, bool CanReport, bool CanModerate, bool CanRequestAiSolution, bool CanResolveDispute);

public sealed record QuestionDetailView(
    int Id,
    QuestionSource Source,
    LessonRefView Lesson,
    TopicRefView? Topic,
    UserRefView? Author,
    string? Text,
    int? ImageFileId,
    ImageView? Image,
    QuestionOptionsView Options,
    DateTime? PublishedAt,
    DateTime CreatedAt,
    byte? CorrectOption,
    string? Description,
    QuestionStatsView? Stats,
    MyAnswerView? MyAnswer,
    bool? IsAnswerDisputed,
    byte? AiSuggestedOption,
    QuestionPermissionsView Permissions,
    int? LikeCount,
    bool LikedByMe,
    byte[]? RowVersion,
    string AiSolutionState,
    DateTime? AnswerKeyReviewedAt,
    UserRefView? AnswerKeyReviewedBy,
    string? AnswerKeyReviewNote,
    bool IsHidden,
    DateTime? HiddenAt);

public interface IQuestionService
{
    Task<ServiceResult<QuestionDetailView>> GetDetailAsync(Actor actor, int questionId, CancellationToken cancellationToken = default);
}

public sealed class QuestionService(AppDbContext db, IQuestionAccessService access, UserLookupService users, IFileUrlService urls, IAiSolutionService aiSolutions) : IQuestionService
{
    public async Task<ServiceResult<QuestionDetailView>> GetDetailAsync(Actor actor, int questionId, CancellationToken cancellationToken = default)
    {
        var decision = await access.GetAsync(questionId, actor, cancellationToken);
        if (decision is null || (!decision.IsVisible && !decision.IsHiddenOwnerView))
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        var q = await db.Questions.AsNoTracking()
            .Where(x => x.Id == questionId)
            .Select(x => new
            {
                x.Id,
                x.Source,
                x.LessonId,
                LessonName = x.Lesson.Name,
                x.TopicId,
                x.AuthorUserId,
                x.Text,
                x.ImageFileId,
                x.OptionA,
                x.OptionB,
                x.OptionC,
                x.OptionD,
                x.CorrectOption,
                x.Description,
                x.PublishedAt,
                x.CreatedAt,
                x.IsHidden,
                x.HiddenAt,
                x.IsAnswerDisputed,
                x.AiSuggestedOption,
                x.AnswerKeyReviewedAt,
                x.AnswerKeyReviewedByUserId,
                x.AnswerKeyReviewNote,
                x.RowVersion
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (q is null)
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        TopicRefView? topic = null;
        if (q.TopicId is int topicId)
        {
            topic = await db.Topics.AsNoTracking()
                .Where(t => t.Id == topicId)
                .Select(t => new TopicRefView(t.Id, t.Name))
                .FirstOrDefaultAsync(cancellationToken);
        }

        var peopleIds = actor.IsModerator && q.AnswerKeyReviewedByUserId is int reviewerId ? new[] { q.AuthorUserId, reviewerId } : [q.AuthorUserId];
        var people = await users.GetAsync(peopleIds, actor.IsModerator, cancellationToken);
        people.TryGetValue(q.AuthorUserId, out var author);

        var currentUserId = actor.UserId;
        var hideLikeCount = decision.Facts.AssignmentState == AssignmentEffectiveState.Open && !decision.CanSeeOwnResult;
        int? likeCount = hideLikeCount ? null : await db.QuestionLikes.AsNoTracking().CountAsync(l => l.QuestionId == questionId, cancellationToken);
        var likedByMe = await db.QuestionLikes.AsNoTracking().AnyAsync(l => l.QuestionId == questionId && l.UserId == currentUserId, cancellationToken);

        QuestionStatsView? stats = null;
        MyAnswerView? myAnswer = null;
        if (decision.CanSeeDiscussion)
        {
            var answerStats = await db.Answers.AsNoTracking()
                .Where(a => a.QuestionId == questionId)
                .GroupBy(a => a.QuestionId)
                .Select(g => new { Total = g.Count(), Correct = g.Count(a => a.IsCorrect) })
                .FirstOrDefaultAsync(cancellationToken);

            var solutionCount = await db.Solutions.AsNoTracking()
                .CountAsync(s => s.QuestionId == questionId && !s.IsDeleted && !s.IsHidden, cancellationToken);

            var commentCount = await db.Comments.AsNoTracking()
                .CountAsync(c => c.QuestionId == questionId && c.Status == CommentStatus.Active, cancellationToken);

            stats = new QuestionStatsView(answerStats?.Total ?? 0, answerStats?.Correct ?? 0, solutionCount, commentCount);
        }

        if (decision.CanSeeOwnResult)
        {
            var userId = actor.UserId;
            var mine = await db.Answers.AsNoTracking()
                .Where(a => a.QuestionId == questionId && a.UserId == userId)
                .Select(a => new
                {
                    a.SelectedOption,
                    a.IsCorrect,
                    a.AnsweredAt,
                    SolutionId = db.Solutions.Where(s => s.AnswerId == a.Id).Select(s => (int?)s.Id).FirstOrDefault()
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (mine is not null)
            {
                myAnswer = new MyAnswerView(mine.SelectedOption, mine.IsCorrect, mine.AnsweredAt, mine.SolutionId);
            }
        }

        var canResolve = actor.IsModerator && await AnswerKeyScope.CanResolveAsync(db, actor, q.LessonId, cancellationToken);

        var aiState = await aiSolutions.GetStateAsync(actor, questionId, decision.CanSeeDiscussion, cancellationToken);

        var view = new QuestionDetailView(
            q.Id,
            q.Source,
            new LessonRefView(q.LessonId, q.LessonName),
            topic,
            author,
            q.Text,
            q.ImageFileId,
            await urls.GetOneAsync(q.ImageFileId, cancellationToken),
            new QuestionOptionsView(q.OptionA, q.OptionB, q.OptionC, q.OptionD),
            q.PublishedAt,
            q.CreatedAt,
            decision.CanSeeOwnResult ? q.CorrectOption : null,
            decision.CanSeeDiscussion || decision.IsHiddenOwnerView ? q.Description : null,
            stats,
            myAnswer,
            actor.IsModerator ? q.IsAnswerDisputed : null,
            canResolve ? q.AiSuggestedOption : null,
            new QuestionPermissionsView(decision.CanAnswer, decision.CanSeeDiscussion, decision.CanSeeOwnResult, decision.CanReport, decision.CanModerate, aiState.CanRequest, canResolve),
            likeCount,
            likedByMe,
            actor.IsModerator ? q.RowVersion : null,
            aiState.State,
            actor.IsModerator ? q.AnswerKeyReviewedAt : null,
            actor.IsModerator && q.AnswerKeyReviewedByUserId is int reviewedBy ? people.GetValueOrDefault(reviewedBy) : null,
            actor.IsModerator ? q.AnswerKeyReviewNote : null,
            q.IsHidden,
            actor.IsModerator || decision.IsHiddenOwnerView ? q.HiddenAt : null);

        return ServiceResult<QuestionDetailView>.Ok(view);
    }
}
