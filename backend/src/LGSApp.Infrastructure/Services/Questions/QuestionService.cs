using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Questions;

public sealed record LessonRefView(int Id, string Name);

public sealed record TopicRefView(int Id, string Name);

public sealed record QuestionOptionsView(string? A, string? B, string? C, string? D);

public sealed record QuestionStatsView(int AnswerCount, int CorrectCount, int SolutionCount, int CommentCount);

public sealed record MyAnswerView(byte SelectedOption, bool IsCorrect, DateTime AnsweredAt, int? SolutionId);

public sealed record QuestionPermissionsView(bool CanAnswer, bool CanSeeDiscussion, bool CanReport, bool CanModerate);

public sealed record QuestionDetailView(
    int Id,
    QuestionSource Source,
    LessonRefView Lesson,
    TopicRefView? Topic,
    UserRefView? Author,
    string? Text,
    int? ImageFileId,
    QuestionOptionsView Options,
    DateTime? PublishedAt,
    DateTime CreatedAt,
    byte? CorrectOption,
    string? Description,
    QuestionStatsView? Stats,
    MyAnswerView? MyAnswer,
    bool? IsAnswerDisputed,
    byte? AiSuggestedOption,
    QuestionPermissionsView Permissions);

public interface IQuestionService
{
    Task<ServiceResult<QuestionDetailView>> GetDetailAsync(Actor actor, int questionId, CancellationToken cancellationToken = default);
}

public sealed class QuestionService(AppDbContext db, IQuestionAccessService access, UserLookupService users) : IQuestionService
{
    public async Task<ServiceResult<QuestionDetailView>> GetDetailAsync(Actor actor, int questionId, CancellationToken cancellationToken = default)
    {
        var decision = await access.GetAsync(questionId, actor, cancellationToken);
        if (decision is null || !decision.IsVisible)
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
                x.IsAnswerDisputed,
                x.AiSuggestedOption
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

        var people = await users.GetAsync([q.AuthorUserId], actor.IsModerator, cancellationToken);
        people.TryGetValue(q.AuthorUserId, out var author);

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

        var view = new QuestionDetailView(
            q.Id,
            q.Source,
            new LessonRefView(q.LessonId, q.LessonName),
            topic,
            author,
            q.Text,
            q.ImageFileId,
            new QuestionOptionsView(q.OptionA, q.OptionB, q.OptionC, q.OptionD),
            q.PublishedAt,
            q.CreatedAt,
            decision.CanSeeDiscussion ? q.CorrectOption : null,
            decision.CanSeeDiscussion ? q.Description : null,
            stats,
            myAnswer,
            actor.IsModerator ? q.IsAnswerDisputed : null,
            actor.IsModerator ? q.AiSuggestedOption : null,
            new QuestionPermissionsView(decision.CanAnswer, decision.CanSeeDiscussion, decision.CanReport, decision.CanModerate));

        return ServiceResult<QuestionDetailView>.Ok(view);
    }
}
