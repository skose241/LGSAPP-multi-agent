using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Settings;
using LGSApp.Infrastructure.Services.Stats;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Questions;

public static class NeedsSolutionRules
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;
}

public sealed record NeedsSolutionQuery(int? LessonId, int Page, int PageSize);

public sealed record NeedsSolutionItemView(
    int Id,
    QuestionSource Source,
    LessonRefView Lesson,
    TopicRefView? Topic,
    string? PreviewText,
    ImageView? Image,
    byte CorrectOption,
    bool IsAnswerDisputed,
    DateTime CreatedAt,
    DateTime? PublishedAt,
    int TotalAnswers,
    int WrongAnswers,
    double WrongRate);

public sealed record NeedsSolutionListView(
    int Page,
    int PageSize,
    int TotalCount,
    int ThresholdAnswers,
    int ThresholdWrongRate,
    int? LessonId,
    IReadOnlyList<NeedsSolutionItemView> Items);

public interface INeedsSolutionService
{
    Task<ServiceResult<NeedsSolutionListView>> ListAsync(Actor actor, NeedsSolutionQuery query, CancellationToken cancellationToken = default);
    Task<ServiceResult> SetNotNeededAsync(Actor actor, int questionId, bool notNeeded, CancellationToken cancellationToken = default);
}

public sealed class NeedsSolutionService(AppDbContext db, ISettingsService settings, IFileUrlService urls) : INeedsSolutionService
{
    public async Task<ServiceResult<NeedsSolutionListView>> ListAsync(Actor actor, NeedsSolutionQuery query, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden(AnswerKeyScope.ModeratorOnlyMessage);
        }

        if (query.Page < 1)
        {
            return Fail.Validation("Sayfa numarası 1 veya daha büyük olmalıdır.");
        }

        if (query.PageSize < 1 || query.PageSize > NeedsSolutionRules.MaxPageSize)
        {
            return Fail.Validation($"Sayfa boyutu 1 ile {NeedsSolutionRules.MaxPageSize} arasında olmalıdır.");
        }

        if (query.LessonId is < 1)
        {
            return Fail.Validation("Geçersiz ders.");
        }

        var thresholdAnswers = Math.Max(1, await settings.GetIntAsync(SettingKeys.CozumEsikCevapSayisi, cancellationToken));
        var thresholdRate = Math.Max(0, await settings.GetIntAsync(SettingKeys.CozumEsikYanlisOrani, cancellationToken));

        var lessonFilter = query.LessonId;
        if (actor.IsTeacher)
        {
            var branch = await AnswerKeyScope.ReadBranchAsync(db, actor.UserId, cancellationToken);
            if (branch is null)
            {
                return Fail.Forbidden(AnswerKeyScope.NoBranchMessage);
            }

            if (lessonFilter is int requested && requested != branch)
            {
                return Fail.Forbidden(AnswerKeyScope.ViewWrongBranchMessage);
            }

            lessonFilter = branch;
        }

        var candidates = db.Questions.AsNoTracking()
            .Where(q => q.PublishedAt != null
                && !q.IsHidden
                && !q.SolutionNotNeeded
                && !db.Solutions.Any(s => s.QuestionId == q.Id && s.Type == SolutionType.Teacher && !s.IsDeleted));

        if (lessonFilter is int lessonId)
        {
            candidates = candidates.Where(q => q.LessonId == lessonId);
        }

        var counted = candidates.Select(q => new
        {
            Question = q,
            Total = db.Answers.Count(a => a.QuestionId == q.Id),
            Wrong = db.Answers.Count(a => a.QuestionId == q.Id && !a.IsCorrect)
        });

        var matching = counted.Where(x => x.Total >= thresholdAnswers && x.Wrong * 100 >= thresholdRate * x.Total);

        var total = await matching.CountAsync(cancellationToken);
        var offset = (long)(query.Page - 1) * query.PageSize;
        if (offset >= total)
        {
            return ServiceResult<NeedsSolutionListView>.Ok(new NeedsSolutionListView(query.Page, query.PageSize, total, thresholdAnswers, thresholdRate, query.LessonId, []));
        }

        var rows = await matching
            .OrderByDescending(x => (double)x.Wrong / x.Total)
            .ThenByDescending(x => x.Total)
            .ThenBy(x => x.Question.Id)
            .Skip((int)offset)
            .Take(query.PageSize)
            .Select(x => new
            {
                x.Question.Id,
                x.Question.Source,
                x.Question.LessonId,
                LessonName = x.Question.Lesson.Name,
                x.Question.TopicId,
                TopicName = db.Topics.Where(t => t.Id == x.Question.TopicId).Select(t => t.Name).FirstOrDefault(),
                TextHead = x.Question.Text == null ? null : x.Question.Text.Substring(0, QuestionPoolRules.PreviewSourceLength),
                x.Question.ImageFileId,
                x.Question.CorrectOption,
                x.Question.IsAnswerDisputed,
                x.Question.CreatedAt,
                x.Question.PublishedAt,
                x.Total,
                x.Wrong
            })
            .ToListAsync(cancellationToken);

        var images = await urls.GetAsync(rows.Select(r => r.ImageFileId), cancellationToken);

        var items = rows.Select(r => new NeedsSolutionItemView(
            r.Id,
            r.Source,
            new LessonRefView(r.LessonId, r.LessonName),
            r.TopicId is int topicId && r.TopicName is not null ? new TopicRefView(topicId, r.TopicName) : null,
            QuestionPoolRules.Preview(r.TextHead),
            images.Find(r.ImageFileId),
            r.CorrectOption,
            r.IsAnswerDisputed,
            r.CreatedAt,
            r.PublishedAt,
            r.Total,
            r.Wrong,
            StatsRules.WrongRate(r.Total, r.Wrong))).ToList();

        return ServiceResult<NeedsSolutionListView>.Ok(new NeedsSolutionListView(query.Page, query.PageSize, total, thresholdAnswers, thresholdRate, query.LessonId, items));
    }

    public async Task<ServiceResult> SetNotNeededAsync(Actor actor, int questionId, bool notNeeded, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden(AnswerKeyScope.ModeratorOnlyMessage);
        }

        var question = await db.Questions.FirstOrDefaultAsync(q => q.Id == questionId, cancellationToken);
        if (question is null)
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        var denied = await AnswerKeyScope.AuthorizeAsync(db, actor, question.LessonId, cancellationToken);
        if (denied is { } scopeFailure)
        {
            return scopeFailure;
        }

        if (question.SolutionNotNeeded == notNeeded)
        {
            return ServiceResult.Ok();
        }

        question.SolutionNotNeeded = notNeeded;
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Fail.Conflict("Soru başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }

        return ServiceResult.Ok();
    }
}
