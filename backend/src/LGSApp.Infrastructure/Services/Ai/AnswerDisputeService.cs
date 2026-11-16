using System.Globalization;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LGSApp.Infrastructure.Services.Ai;

public enum AiSolutionKeyDecision
{
    Publish = 1,
    Remove = 2
}

public static class AnswerKeyAiSolutionRules
{
    public static AiSolutionKeyDecision Decide(byte? statedOption, byte newCorrectOption) =>
        statedOption is { } stated && stated == newCorrectOption
            ? AiSolutionKeyDecision.Publish
            : AiSolutionKeyDecision.Remove;

    public static AiSolutionKeyDecision Apply(Solution solution, byte newCorrectOption, bool wasDisputed, DateTime now)
    {
        var decision = Decide(solution.StatedOption, newCorrectOption);
        if (decision == AiSolutionKeyDecision.Publish)
        {
            if (solution.IsHidden && wasDisputed)
            {
                solution.IsHidden = false;
                solution.UpdatedAt = now;
            }
        }
        else
        {
            solution.IsDeleted = true;
            solution.UpdatedAt = now;
        }

        return decision;
    }

    public static bool ShouldDeleteOnDismiss(Solution solution) =>
        solution is { Type: SolutionType.Ai, IsDeleted: false, IsHidden: true };
}

public sealed record DismissDisputeCommand(byte[]? RowVersion, string? Note);

public static class DismissDisputeRules
{
    public const int NoteMaxLength = AnswerKeyReviewNote.MaxLength;
    public const string NotDisputedMessage = "Bu soruda bekleyen bir cevap anahtarı şüphesi yok.";
    public const string RowVersionRequiredMessage = "Sürüm bilgisi zorunludur.";
    public const string StaleMessage = "Soru başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.";

    public static ServiceResult<DismissDisputeCommand> Validate(DismissDisputeCommand command)
    {
        if (command.RowVersion is null || command.RowVersion.Length == 0)
        {
            return Fail.Validation(RowVersionRequiredMessage);
        }

        var invalid = AnswerKeyReviewNote.TryPrepare(command.Note, out var note);
        if (invalid is { } failure)
        {
            return failure;
        }

        return ServiceResult<DismissDisputeCommand>.Ok(command with { Note = note });
    }
}

public sealed record DismissDisputeView(int QuestionId, bool AiSolutionDeleted, byte[] RowVersion);

public sealed record DisputedQuestionListQuery(int? LessonId, int Page, int PageSize);

public sealed record DisputedQuestionItemView(
    int QuestionId,
    int LessonId,
    string LessonName,
    int? TopicId,
    string? TopicName,
    string? Summary,
    bool HasImage,
    QuestionSource Source,
    byte CorrectOption,
    byte? AiSuggestedOption,
    DateTime? AnswerDisputedAt,
    int AnswerCount,
    IReadOnlyList<AnswerDistributionView> AnswerDistribution,
    int PendingWrongAnswerKeyReportCount,
    int? HiddenAiSolutionId,
    bool IsHidden,
    DateTime? AnswerKeyReviewedAt,
    UserRefView? AnswerKeyReviewedBy,
    string? AnswerKeyReviewNote,
    byte[] RowVersion);

public sealed record DisputedQuestionListView(int Page, int PageSize, int TotalCount, int? LessonId, IReadOnlyList<DisputedQuestionItemView> Items);

public interface IAnswerDisputeService
{
    Task<ServiceResult<DisputedQuestionListView>> ListAsync(Actor actor, DisputedQuestionListQuery query, CancellationToken cancellationToken = default);
    Task<ServiceResult<DismissDisputeView>> DismissAsync(Actor actor, int questionId, DismissDisputeCommand command, CancellationToken cancellationToken = default);
}

public sealed class AnswerDisputeService(
    AppDbContext db,
    TurkeyTime clock,
    UserLookupService users,
    ILogger<AnswerDisputeService> logger) : IAnswerDisputeService
{
    public const int MaxPageSize = 50;
    private const int SummaryMaxLength = 200;

    public async Task<ServiceResult<DisputedQuestionListView>> ListAsync(Actor actor, DisputedQuestionListQuery query, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Şüpheli soruları yalnızca öğretmen veya müdür görebilir.");
        }

        if (query.Page < 1)
        {
            return Fail.Validation("Sayfa numarası 1 veya daha büyük olmalıdır.");
        }

        if (query.PageSize < 1 || query.PageSize > MaxPageSize)
        {
            return Fail.Validation($"Sayfa boyutu 1 ile {MaxPageSize.ToString(CultureInfo.InvariantCulture)} arasında olmalıdır.");
        }

        if (query.LessonId is < 1)
        {
            return Fail.Validation("Geçersiz ders.");
        }

        var lessonId = query.LessonId;
        if (actor.IsTeacher)
        {
            var branch = await AnswerKeyScope.ReadBranchAsync(db, actor.UserId, cancellationToken);
            if (branch is null)
            {
                return Fail.Forbidden(AnswerKeyScope.NoBranchMessage);
            }

            if (lessonId is int requested && requested != branch)
            {
                return Fail.Forbidden(AnswerKeyScope.ViewWrongBranchMessage);
            }

            lessonId = branch;
        }

        var filtered = db.Questions.AsNoTracking().Where(q => q.IsAnswerDisputed);
        if (lessonId is int lesson)
        {
            filtered = filtered.Where(q => q.LessonId == lesson);
        }

        var total = await filtered.CountAsync(cancellationToken);
        var offset = (long)(query.Page - 1) * query.PageSize;
        if (offset >= total)
        {
            return ServiceResult<DisputedQuestionListView>.Ok(new DisputedQuestionListView(query.Page, query.PageSize, total, lessonId, []));
        }

        var rows = await filtered
            .OrderByDescending(q => q.AnswerDisputedAt)
            .ThenByDescending(q => q.Id)
            .Skip((int)offset)
            .Take(query.PageSize)
            .Select(q => new
            {
                q.Id,
                q.LessonId,
                LessonName = q.Lesson.Name,
                q.TopicId,
                q.Source,
                q.Text,
                HasImage = q.ImageFileId != null,
                q.CorrectOption,
                q.AiSuggestedOption,
                q.AnswerDisputedAt,
                q.IsHidden,
                q.AnswerKeyReviewedAt,
                q.AnswerKeyReviewedByUserId,
                q.AnswerKeyReviewNote,
                q.RowVersion
            })
            .ToListAsync(cancellationToken);

        var ids = rows.Select(r => r.Id).ToList();
        var topicIds = rows.Where(r => r.TopicId != null).Select(r => r.TopicId!.Value).Distinct().ToList();

        var topics = await db.Topics.AsNoTracking()
            .Where(t => topicIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.Name, cancellationToken);

        var distribution = (await db.Answers.AsNoTracking()
                .Where(a => ids.Contains(a.QuestionId))
                .GroupBy(a => new { a.QuestionId, a.SelectedOption })
                .Select(g => new { g.Key.QuestionId, g.Key.SelectedOption, Count = g.Count() })
                .ToListAsync(cancellationToken))
            .GroupBy(x => x.QuestionId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var pendingReports = await db.Reports.AsNoTracking()
            .Where(r => ids.Contains(r.QuestionId)
                && r.Status == ReportStatus.Pending
                && r.TargetType == ReportTargetType.Question
                && r.Reason == ReportReason.WrongAnswerKey)
            .GroupBy(r => r.QuestionId)
            .Select(g => new { QuestionId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.QuestionId, x => x.Count, cancellationToken);

        var hiddenSolutions = await db.Solutions.AsNoTracking()
            .Where(s => ids.Contains(s.QuestionId) && s.Type == SolutionType.Ai && !s.IsDeleted && s.IsHidden)
            .Select(s => new { s.QuestionId, s.Id })
            .ToListAsync(cancellationToken);
        var hiddenByQuestion = hiddenSolutions.GroupBy(s => s.QuestionId).ToDictionary(g => g.Key, g => g.Max(s => s.Id));

        var reviewerIds = rows.Where(r => r.AnswerKeyReviewedByUserId != null).Select(r => r.AnswerKeyReviewedByUserId!.Value);
        var reviewers = await users.GetAsync(reviewerIds, true, cancellationToken);

        var items = rows.Select(r =>
        {
            var counts = distribution.GetValueOrDefault(r.Id) ?? [];
            var options = Enumerable.Range(1, 4)
                .Select(o => new AnswerDistributionView((byte)o, counts.Where(c => c.SelectedOption == o).Sum(c => c.Count)))
                .ToList();
            return new DisputedQuestionItemView(
                r.Id,
                r.LessonId,
                r.LessonName,
                r.TopicId,
                r.TopicId is int t ? topics.GetValueOrDefault(t) : null,
                Summarize(r.Text),
                r.HasImage,
                r.Source,
                r.CorrectOption,
                r.AiSuggestedOption,
                r.AnswerDisputedAt,
                options.Sum(o => o.Count),
                options,
                pendingReports.GetValueOrDefault(r.Id),
                hiddenByQuestion.TryGetValue(r.Id, out var solutionId) ? solutionId : null,
                r.IsHidden,
                r.AnswerKeyReviewedAt,
                r.AnswerKeyReviewedByUserId is int reviewer ? reviewers.GetValueOrDefault(reviewer) : null,
                r.AnswerKeyReviewNote,
                r.RowVersion);
        }).ToList();

        return ServiceResult<DisputedQuestionListView>.Ok(new DisputedQuestionListView(query.Page, query.PageSize, total, lessonId, items));
    }

    public async Task<ServiceResult<DismissDisputeView>> DismissAsync(Actor actor, int questionId, DismissDisputeCommand command, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür cevap anahtarı şüphesini kapatabilir.");
        }

        var validated = DismissDisputeRules.Validate(command);
        if (!validated.Succeeded)
        {
            return ServiceResult<DismissDisputeView>.From(validated);
        }

        var normalized = validated.Value!;
        return await db.ExecuteInTransactionAsync<ServiceResult<DismissDisputeView>>(
            token => DismissCoreAsync(actor, questionId, normalized, token),
            cancellationToken);
    }

    private async Task<ServiceResult<DismissDisputeView>> DismissCoreAsync(Actor actor, int questionId, DismissDisputeCommand command, CancellationToken token)
    {
        var question = await db.Questions
            .FromSqlInterpolated($"SELECT * FROM [Questions] WITH (UPDLOCK, ROWLOCK) WHERE [Id] = {questionId}")
            .FirstOrDefaultAsync(token);
        if (question is null)
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        var denied = await AnswerKeyScope.AuthorizeAsync(db, actor, question.LessonId, token);
        if (denied is { } scopeFailure)
        {
            return scopeFailure;
        }

        if (!question.IsAnswerDisputed)
        {
            return Fail.Conflict(DismissDisputeRules.NotDisputedMessage);
        }

        if (!question.RowVersion.AsSpan().SequenceEqual(command.RowVersion))
        {
            return Fail.Conflict(DismissDisputeRules.StaleMessage);
        }

        var now = clock.UtcNow;
        question.IsAnswerDisputed = false;
        question.AnswerDisputedAt = null;
        question.AiSuggestedOption = null;
        question.AnswerKeyReviewedAt = now;
        question.AnswerKeyReviewedByUserId = actor.UserId;
        question.AnswerKeyReviewNote = command.Note;

        var solutions = await db.Solutions
            .Where(s => s.QuestionId == questionId && s.Type == SolutionType.Ai && !s.IsDeleted)
            .ToListAsync(token);
        var deleted = false;
        foreach (var solution in solutions.Where(AnswerKeyAiSolutionRules.ShouldDeleteOnDismiss))
        {
            solution.IsDeleted = true;
            solution.UpdatedAt = now;
            deleted = true;
        }

        try
        {
            await db.SaveChangesAsync(token);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Fail.Conflict("Kayıt başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }

        logger.LogInformation(
            "Cevap anahtarı şüphesi kapatıldı. Soru {QuestionId}, kullanıcı {UserId}, yapay zekâ çözümü silindi: {Deleted}, not: {Note}",
            questionId, actor.UserId, deleted, command.Note);

        return ServiceResult<DismissDisputeView>.Ok(new DismissDisputeView(questionId, deleted, question.RowVersion));
    }

    private static string? Summarize(string? text)
    {
        if (text is null || text.Length <= SummaryMaxLength)
        {
            return text;
        }

        var end = SummaryMaxLength;
        if (char.IsHighSurrogate(text[end - 1]))
        {
            end--;
        }

        return text[..end];
    }
}
