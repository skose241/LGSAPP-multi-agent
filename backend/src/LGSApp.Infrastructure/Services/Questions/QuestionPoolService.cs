using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Questions;

public sealed record PoolMyAnswerView(byte SelectedOption, bool IsCorrect, DateTime AnsweredAt);

public sealed record QuestionPoolItemView(
    int Id,
    QuestionSource Source,
    LessonRefView Lesson,
    TopicRefView? Topic,
    UserRefView? Author,
    DateTime? PublishedAt,
    DateOnly? ScheduledPublishDate,
    bool? IsHidden,
    string? PreviewText,
    ImageView? Image,
    int OptionCount,
    bool HasTextOptions,
    bool IsMine,
    PoolMyAnswerView? MyAnswer,
    byte? CorrectOption,
    int LikeCount,
    bool LikedByMe,
    int? CommentCount);

public sealed record QuestionPoolListView(int Page, int PageSize, int TotalCount, IReadOnlyList<QuestionPoolItemView> Items);

public sealed record QuestionPoolQuery(
    int? LessonId,
    int? TopicId,
    QuestionSource? Source,
    bool? Answered,
    int? Since,
    bool IncludeHidden,
    bool Scheduled,
    int Page,
    int PageSize);

public interface IQuestionPoolService
{
    Task<ServiceResult<QuestionPoolListView>> ListAsync(Actor actor, QuestionPoolQuery query, CancellationToken cancellationToken = default);
}

public sealed class QuestionPoolService(AppDbContext db, UserLookupService users, IFileUrlService urls, TurkeyTime clock) : IQuestionPoolService
{
    private sealed record Row(
        int Id,
        QuestionSource Source,
        int LessonId,
        string LessonName,
        int? TopicId,
        string? TopicName,
        int AuthorUserId,
        string? TextHead,
        int? ImageFileId,
        bool HasTextOptions,
        DateTime? PublishedAt,
        DateOnly? ScheduledPublishDate,
        bool IsHidden,
        byte CorrectOption,
        byte? MySelected,
        bool? MyCorrect,
        DateTime? MyAnsweredAt,
        int LikeCount,
        bool LikedByMe,
        int CommentCount);

    public async Task<ServiceResult<QuestionPoolListView>> ListAsync(Actor actor, QuestionPoolQuery query, CancellationToken cancellationToken = default)
    {
        var errors = QuestionPoolRules.ValidateFilters(actor.IsStudent, query.Source, query.Answered, query.Since, query.IncludeHidden, query.Scheduled);
        if (errors.Count > 0)
        {
            return Fail.Validation("Filtre değerleri geçersiz.", errors);
        }

        var (page, pageSize) = QuestionPoolRules.NormalizePaging(query.Page, query.PageSize);
        var userId = actor.UserId;

        var source = db.Questions.AsNoTracking()
            .Where(q => !db.AssignmentQuestions.Any(aq => aq.QuestionId == q.Id
                && db.Assignments.Any(a => a.Id == aq.AssignmentId && !a.IsDeleted)));

        if (query.Scheduled)
        {
            source = source.Where(q => q.PublishedAt == null && q.ScheduledPublishDate != null);
        }
        else
        {
            source = source.Where(q => q.PublishedAt != null && (query.IncludeHidden || !q.IsHidden));
            if (query.Since is int days)
            {
                var cutoff = clock.UtcNow.AddDays(-days);
                source = source.Where(q => q.PublishedAt >= cutoff);
            }
        }

        if (query.LessonId is int lessonId)
        {
            source = source.Where(q => q.LessonId == lessonId);
        }

        if (query.TopicId is int topicId)
        {
            source = source.Where(q => q.TopicId == topicId);
        }

        if (query.Source is QuestionSource questionSource)
        {
            source = source.Where(q => q.Source == questionSource);
        }

        if (query.Answered is bool answered)
        {
            source = answered
                ? source.Where(q => db.Answers.Any(a => a.QuestionId == q.Id && a.UserId == userId))
                : source.Where(q => q.AuthorUserId != userId && !db.Answers.Any(a => a.QuestionId == q.Id && a.UserId == userId));
        }

        var total = await source.CountAsync(cancellationToken);
        var offset = (long)(page - 1) * pageSize;
        if (offset >= total)
        {
            return ServiceResult<QuestionPoolListView>.Ok(new QuestionPoolListView(page, pageSize, total, []));
        }

        var ordered = query.Scheduled
            ? source.OrderByDescending(q => q.ScheduledPublishDate).ThenByDescending(q => q.Id)
            : source.OrderByDescending(q => q.PublishedAt).ThenByDescending(q => q.Id);

        var rows = await ordered
            .Skip((int)offset)
            .Take(pageSize)
            .Select(q => new Row(
                q.Id,
                q.Source,
                q.LessonId,
                q.Lesson.Name,
                q.TopicId,
                db.Topics.Where(t => t.Id == q.TopicId).Select(t => t.Name).FirstOrDefault(),
                q.AuthorUserId,
                q.Text == null ? null : q.Text.Substring(0, QuestionPoolRules.PreviewSourceLength),
                q.ImageFileId,
                q.OptionA != null,
                q.PublishedAt,
                q.ScheduledPublishDate,
                q.IsHidden,
                q.CorrectOption,
                db.Answers.Where(a => a.QuestionId == q.Id && a.UserId == userId).Select(a => (byte?)a.SelectedOption).FirstOrDefault(),
                db.Answers.Where(a => a.QuestionId == q.Id && a.UserId == userId).Select(a => (bool?)a.IsCorrect).FirstOrDefault(),
                db.Answers.Where(a => a.QuestionId == q.Id && a.UserId == userId).Select(a => (DateTime?)a.AnsweredAt).FirstOrDefault(),
                db.QuestionLikes.Count(l => l.QuestionId == q.Id),
                db.QuestionLikes.Any(l => l.QuestionId == q.Id && l.UserId == userId),
                db.Comments.Count(c => c.QuestionId == q.Id && c.Status == CommentStatus.Active)))
            .ToListAsync(cancellationToken);

        var images = await urls.GetAsync(rows.Select(r => r.ImageFileId), cancellationToken);
        var people = await users.GetAsync(rows.Select(r => r.AuthorUserId), actor.IsModerator, cancellationToken);

        var items = rows.Select(r =>
        {
            var isOwner = r.AuthorUserId == userId;
            var hasAnswered = r.MySelected is not null;
            return new QuestionPoolItemView(
                r.Id,
                r.Source,
                new LessonRefView(r.LessonId, r.LessonName),
                r.TopicId is int tid && r.TopicName is not null ? new TopicRefView(tid, r.TopicName) : null,
                people.GetValueOrDefault(r.AuthorUserId),
                r.PublishedAt,
                actor.IsModerator ? r.ScheduledPublishDate : null,
                actor.IsModerator ? r.IsHidden : null,
                QuestionPoolRules.Preview(r.TextHead),
                images.Find(r.ImageFileId),
                QuestionPoolRules.OptionCount,
                r.HasTextOptions,
                isOwner,
                hasAnswered ? new PoolMyAnswerView(r.MySelected!.Value, r.MyCorrect ?? false, r.MyAnsweredAt ?? default) : null,
                QuestionPoolRules.ShowCorrectOption(actor.IsModerator, isOwner, hasAnswered) ? r.CorrectOption : null,
                r.LikeCount,
                r.LikedByMe,
                QuestionPoolRules.ShowDiscussionStats(actor.IsModerator, isOwner, hasAnswered) ? r.CommentCount : null);
        }).ToList();

        return ServiceResult<QuestionPoolListView>.Ok(new QuestionPoolListView(page, pageSize, total, items));
    }
}
