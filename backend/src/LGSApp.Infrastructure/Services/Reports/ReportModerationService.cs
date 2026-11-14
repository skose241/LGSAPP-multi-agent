using System.Globalization;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Comments;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Notifications;
using LGSApp.Infrastructure.Services.Questions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Reports;

public enum ReportResolveAction
{
    Reject = 0,
    HideContent = 1,
    ChangeAnswerKey = 2,
    BanUser = 3
}

public static class ReportResolveRules
{
    public static bool TouchesAnswerKey(ReportTargetType targetType, ReportResolveAction action, bool groupHasWrongAnswerKey) =>
        targetType == ReportTargetType.Question
        && (action == ReportResolveAction.ChangeAnswerKey
            || (action is ReportResolveAction.Reject or ReportResolveAction.HideContent && groupHasWrongAnswerKey));
}

public sealed record ReportListQuery(ReportStatus? Status, ReportTargetType? TargetType, ReportReason? Reason, int? QuestionId, int Page, int PageSize);

public sealed record ResolveReportCommand(ReportResolveAction Action, string? Note, byte? CorrectOption, byte[] RowVersion);

public sealed record ReportItemView(
    int Id,
    ReportTargetType TargetType,
    ReportReason Reason,
    ReportStatus Status,
    ReportAction ActionTaken,
    DateTime CreatedAt,
    int QuestionId,
    int? CommentId,
    int? SolutionId,
    string? TargetSummary,
    string Description,
    UserRefView? Reporter,
    UserRefView? Reported,
    int PendingReportCountForTarget,
    DateTime? ResolvedAt,
    UserRefView? ResolvedBy,
    string? ResolutionNote,
    byte[] RowVersion);

public sealed record ReportListView(int Page, int PageSize, int TotalCount, IReadOnlyList<ReportItemView> Items);

public sealed record AnswerDistributionView(byte Option, int Count);

public sealed record ReportQuestionTarget(
    int Id,
    QuestionSource Source,
    int LessonId,
    UserRefView? Author,
    string? Text,
    int? ImageFileId,
    ImageView? Image,
    string? OptionA,
    string? OptionB,
    string? OptionC,
    string? OptionD,
    byte CorrectOption,
    string? Description,
    bool IsHidden,
    bool IsAnswerDisputed,
    byte? AiSuggestedOption,
    DateTime? PublishedAt,
    int AnswerCount,
    IReadOnlyList<AnswerDistributionView> AnswerDistribution,
    DateTime? AnswerKeyReviewedAt,
    UserRefView? AnswerKeyReviewedBy,
    string? AnswerKeyReviewNote,
    byte[] RowVersion);

public sealed record ReportCommentTarget(
    int Id,
    int? SolutionId,
    UserRefView? Author,
    string Body,
    CommentStatus Status,
    string? ModerationReason,
    DateTime CreatedAt);

public sealed record ReportSolutionTarget(
    int Id,
    SolutionType Type,
    UserRefView? Author,
    string? Text,
    int? ImageFileId,
    ImageView? Image,
    bool IsHidden,
    bool IsDeleted,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    byte[] RowVersion);

public sealed record ReportDetailView(
    ReportItemView Report,
    string? TargetSnapshot,
    ReportQuestionTarget? Question,
    ReportCommentTarget? Comment,
    ReportSolutionTarget? Solution,
    IReadOnlyList<ReportItemView> OtherReports);

public sealed record ReportResolveView(
    int ReportId,
    ReportStatus Status,
    ReportAction ActionTaken,
    int ClosedReportCount,
    AnswerKeyChangeView? AnswerKeyChange);

public interface IReportModerationService
{
    Task<ServiceResult<ReportListView>> ListAsync(Actor actor, ReportListQuery query, CancellationToken cancellationToken = default);
    Task<ServiceResult<ReportDetailView>> GetAsync(Actor actor, int reportId, CancellationToken cancellationToken = default);
    Task<ServiceResult<ReportResolveView>> ResolveAsync(Actor actor, int reportId, ResolveReportCommand command, CancellationToken cancellationToken = default);
}

public sealed class ReportModerationService(
    AppDbContext db,
    UserManager<ApplicationUser> userManager,
    IAnswerKeyService answerKeys,
    ICommentService comments,
    INotificationService notifications,
    UserLookupService users,
    IFileUrlService urls,
    TurkeyTime clock) : IReportModerationService
{
    private const int MaxPageSize = 50;
    private const int NoteMaxLength = 500;
    private const int ReasonMaxLength = 300;
    private const int SummaryMaxLength = 200;
    private const string ReportNotFound = "Şikayet bulunamadı.";
    private const string AcceptedMessage = "Şikayetiniz incelendi ve gerekli işlem yapıldı.";
    private const string RejectedMessage = "Şikayetiniz incelendi; herhangi bir işlem yapılmasına gerek görülmedi.";

    public async Task<ServiceResult<ReportListView>> ListAsync(Actor actor, ReportListQuery query, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Şikayetleri yalnızca öğretmen veya müdür görebilir.");
        }

        if (query.Page < 1)
        {
            return Fail.Validation("Sayfa numarası 1 veya daha büyük olmalıdır.");
        }

        if (query.PageSize < 1 || query.PageSize > MaxPageSize)
        {
            return Fail.Validation($"Sayfa boyutu 1 ile {MaxPageSize} arasında olmalıdır.");
        }

        var filtered = db.Reports.AsNoTracking().AsQueryable();
        if (query.Status is ReportStatus status)
        {
            filtered = filtered.Where(r => r.Status == status);
        }

        if (query.TargetType is ReportTargetType targetType)
        {
            filtered = filtered.Where(r => r.TargetType == targetType);
        }

        if (query.Reason is ReportReason reason)
        {
            filtered = filtered.Where(r => r.Reason == reason);
        }

        if (query.QuestionId is int questionId)
        {
            filtered = filtered.Where(r => r.QuestionId == questionId);
        }

        var total = await filtered.CountAsync(cancellationToken);
        var offset = (long)(query.Page - 1) * query.PageSize;
        var rows = offset >= total
            ? new List<Report>()
            : await filtered
                .OrderByDescending(r => r.CreatedAt)
                .ThenByDescending(r => r.Id)
                .Skip((int)offset)
                .Take(query.PageSize)
                .ToListAsync(cancellationToken);

        var items = await BuildItemsAsync(rows, cancellationToken);
        return ServiceResult<ReportListView>.Ok(new ReportListView(query.Page, query.PageSize, total, items));
    }

    public async Task<ServiceResult<ReportDetailView>> GetAsync(Actor actor, int reportId, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Şikayetleri yalnızca öğretmen veya müdür görebilir.");
        }

        var report = await db.Reports.AsNoTracking().FirstOrDefaultAsync(r => r.Id == reportId, cancellationToken);
        if (report is null)
        {
            return Fail.NotFound(ReportNotFound);
        }

        var siblings = SameTarget(db.Reports.AsNoTracking(), report).Where(r => r.Id != reportId);
        var others = await siblings.OrderBy(r => r.CreatedAt).ThenBy(r => r.Id).ToListAsync(cancellationToken);

        var all = new List<Report>(others.Count + 1) { report };
        all.AddRange(others);
        var views = await BuildItemsAsync(all, cancellationToken);

        ReportQuestionTarget? question = null;
        ReportCommentTarget? comment = null;
        ReportSolutionTarget? solution = null;

        switch (report.TargetType)
        {
            case ReportTargetType.Question:
                question = await LoadQuestionTargetAsync(report.QuestionId, cancellationToken);
                break;
            case ReportTargetType.Comment:
                comment = await LoadCommentTargetAsync(report.CommentId!.Value, cancellationToken);
                break;
            case ReportTargetType.Solution:
                solution = await LoadSolutionTargetAsync(report.SolutionId!.Value, cancellationToken);
                break;
        }

        return ServiceResult<ReportDetailView>.Ok(new ReportDetailView(
            views[0],
            report.TargetSnapshot,
            question,
            comment,
            solution,
            views.Skip(1).ToList()));
    }

    public async Task<ServiceResult<ReportResolveView>> ResolveAsync(Actor actor, int reportId, ResolveReportCommand command, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Şikayetleri yalnızca öğretmen veya müdür işleyebilir.");
        }

        if (!Enum.IsDefined(command.Action))
        {
            return Fail.Validation("Geçersiz işlem.");
        }

        if (command.Action == ReportResolveAction.BanUser && !actor.IsMudur)
        {
            return Fail.Forbidden("Yalnızca müdür kullanıcıyı engelleyebilir.");
        }

        if (command.RowVersion is null || command.RowVersion.Length == 0)
        {
            return Fail.Validation("Sürüm bilgisi zorunludur.");
        }

        var note = string.IsNullOrWhiteSpace(command.Note) ? null : command.Note.Trim();
        if (note is not null && note.Length > NoteMaxLength)
        {
            return Fail.Validation($"Not en fazla {NoteMaxLength} karakter olabilir.");
        }

        if (command.Action == ReportResolveAction.ChangeAnswerKey && command.CorrectOption is null or < 1 or > 4)
        {
            return Fail.Validation("Doğru şık 1 ile 4 arasında olmalıdır.");
        }

        var normalized = command with { Note = note };
        return await db.ExecuteInTransactionAsync<ServiceResult<ReportResolveView>>(
            token => ExecuteResolveAsync(actor, reportId, normalized, token),
            cancellationToken);
    }

    private async Task<ServiceResult<ReportResolveView>> ExecuteResolveAsync(Actor actor, int reportId, ResolveReportCommand command, CancellationToken token)
    {
        var report = await db.Reports.FirstOrDefaultAsync(r => r.Id == reportId, token);
        if (report is null)
        {
            return Fail.NotFound(ReportNotFound);
        }

        if (report.Status != ReportStatus.Pending)
        {
            return Fail.Conflict("Bu şikayet zaten işlenmiş.");
        }

        if (!report.RowVersion.AsSpan().SequenceEqual(command.RowVersion))
        {
            return Fail.Conflict("Şikayet başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }

        if (command.Action == ReportResolveAction.ChangeAnswerKey && report.TargetType != ReportTargetType.Question)
        {
            return Fail.Validation("Doğru cevap yalnızca soru şikayetlerinde değiştirilebilir.");
        }

        var group = await SameTarget(db.Reports, report)
            .Where(r => r.Status == ReportStatus.Pending)
            .ToListAsync(token);

        var touchesAnswerKey = ReportResolveRules.TouchesAnswerKey(
            report.TargetType,
            command.Action,
            group.Any(r => r.Reason == ReportReason.WrongAnswerKey));
        if (touchesAnswerKey)
        {
            var lessonId = await db.Questions.AsNoTracking()
                .Where(q => q.Id == report.QuestionId)
                .Select(q => (int?)q.LessonId)
                .FirstOrDefaultAsync(token);
            if (lessonId is null)
            {
                return Fail.NotFound("Soru bulunamadı.");
            }

            var denied = await AnswerKeyScope.AuthorizeAsync(db, actor, lessonId.Value, token);
            if (denied is { } scopeFailure)
            {
                return scopeFailure;
            }
        }

        AnswerKeyChangeView? keyChange = null;

        switch (command.Action)
        {
            case ReportResolveAction.HideContent:
            {
                var hidden = await HideContentAsync(actor, report, command.Note, token);
                if (!hidden.Succeeded)
                {
                    return ServiceResult<ReportResolveView>.From(hidden);
                }

                break;
            }

            case ReportResolveAction.ChangeAnswerKey:
            {
                var changed = await answerKeys.ApplyAsync(
                    actor,
                    report.QuestionId,
                    new ChangeAnswerKeyCommand(command.CorrectOption!.Value, null, command.Note),
                    false,
                    token);
                if (!changed.Succeeded)
                {
                    return ServiceResult<ReportResolveView>.From(changed);
                }

                keyChange = changed.Value;
                break;
            }

            case ReportResolveAction.BanUser:
            {
                var banned = await BanAsync(actor, report.ReportedUserId);
                if (!banned.Succeeded)
                {
                    return ServiceResult<ReportResolveView>.From(banned);
                }

                break;
            }
        }

        var rejected = command.Action == ReportResolveAction.Reject;
        var action = command.Action switch
        {
            ReportResolveAction.HideContent => ReportAction.ContentHidden,
            ReportResolveAction.ChangeAnswerKey => ReportAction.AnswerKeyChanged,
            ReportResolveAction.BanUser => ReportAction.UserBanned,
            _ => ReportAction.None
        };

        db.Entry(report).Property(r => r.RowVersion).OriginalValue = command.RowVersion;

        var now = clock.UtcNow;
        foreach (var item in group)
        {
            item.Status = rejected ? ReportStatus.Rejected : ReportStatus.Resolved;
            item.ActionTaken = action;
            item.ResolvedByUserId = actor.UserId;
            item.ResolvedAt = now;
            item.ResolutionNote = command.Note;

            await notifications.NotifyAsync(
                new NotificationDraft(
                    item.ReporterUserId,
                    NotificationType.ReportResolved,
                    rejected ? RejectedMessage : AcceptedMessage,
                    QuestionId: item.QuestionId,
                    CommentId: item.CommentId,
                    SenderUserId: actor.UserId),
                false,
                token);
        }

        try
        {
            await db.SaveChangesAsync(token);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Fail.Conflict("Şikayet başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }

        return ServiceResult<ReportResolveView>.Ok(new ReportResolveView(
            report.Id,
            report.Status,
            report.ActionTaken,
            group.Count,
            keyChange));
    }

    private async Task<ServiceResult> HideContentAsync(Actor actor, Report report, string? note, CancellationToken token)
    {
        switch (report.TargetType)
        {
            case ReportTargetType.Question:
            {
                var question = await db.Questions.FirstOrDefaultAsync(q => q.Id == report.QuestionId, token);
                if (question is null)
                {
                    return Fail.NotFound("Soru bulunamadı.");
                }

                if (!question.IsHidden)
                {
                    question.IsHidden = true;
                    question.HiddenAt = clock.UtcNow;
                    question.HiddenByUserId = actor.UserId;
                }

                return ServiceResult.Ok();
            }

            case ReportTargetType.Solution:
            {
                var solution = await db.Solutions.FirstOrDefaultAsync(s => s.Id == report.SolutionId, token);
                if (solution is null)
                {
                    return Fail.NotFound("Çözüm bulunamadı.");
                }

                solution.IsHidden = true;
                solution.UpdatedAt = clock.UtcNow;
                return ServiceResult.Ok();
            }

            default:
            {
                var commentId = report.CommentId!.Value;
                var status = await db.Comments.AsNoTracking()
                    .Where(c => c.Id == commentId)
                    .Select(c => (CommentStatus?)c.Status)
                    .FirstOrDefaultAsync(token);
                if (status is null)
                {
                    return Fail.NotFound("Yorum bulunamadı.");
                }

                if (status != CommentStatus.Active)
                {
                    return ServiceResult.Ok();
                }

                var reason = note ?? "Şikayet üzerine kaldırıldı.";
                if (reason.Length > ReasonMaxLength)
                {
                    reason = reason[..ReasonMaxLength];
                }

                return await comments.RemoveForModerationAsync(actor, commentId, reason, token);
            }
        }
    }

    private async Task<ServiceResult> BanAsync(Actor actor, int userId)
    {
        if (userId == actor.UserId)
        {
            return Fail.Validation("Kendi hesabınızı engelleyemezsiniz.");
        }

        var user = await userManager.FindByIdAsync(userId.ToString(CultureInfo.InvariantCulture));
        if (user is null)
        {
            return Fail.NotFound("Kullanıcı bulunamadı.");
        }

        if (await userManager.IsInRoleAsync(user, Roles.Ai))
        {
            return Fail.Validation(SystemAccounts.ManagedMessage);
        }

        if (user.IsBanned)
        {
            return ServiceResult.Ok();
        }

        var result = await userManager.SetBannedAsync(user, true);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code == SystemAccounts.MudurBanErrorCode))
            {
                return Fail.Validation(SystemAccounts.MudurBanMessage);
            }

            return Fail.Validation(string.Join(" ", result.Errors.Select(e => e.Description)));
        }

        return ServiceResult.Ok();
    }

    private static IQueryable<Report> SameTarget(IQueryable<Report> source, Report report)
    {
        var questionId = report.QuestionId;
        var commentId = report.CommentId;
        var solutionId = report.SolutionId;
        return report.TargetType switch
        {
            ReportTargetType.Question => source.Where(r => r.TargetType == ReportTargetType.Question && r.QuestionId == questionId),
            ReportTargetType.Comment => source.Where(r => r.TargetType == ReportTargetType.Comment && r.CommentId == commentId),
            _ => source.Where(r => r.TargetType == ReportTargetType.Solution && r.SolutionId == solutionId)
        };
    }

    private async Task<List<ReportItemView>> BuildItemsAsync(IReadOnlyList<Report> rows, CancellationToken cancellationToken)
    {
        if (rows.Count == 0)
        {
            return [];
        }

        var userIds = rows
            .SelectMany(r => new[] { r.ReporterUserId, r.ReportedUserId, r.ResolvedByUserId ?? 0 })
            .Where(id => id != 0);
        var people = await users.GetAsync(userIds, true, cancellationToken);

        var questionIds = rows.Where(r => r.TargetType == ReportTargetType.Question).Select(r => r.QuestionId).Distinct().ToList();
        var commentIds = rows.Where(r => r.TargetType == ReportTargetType.Comment).Select(r => r.CommentId!.Value).Distinct().ToList();
        var solutionIds = rows.Where(r => r.TargetType == ReportTargetType.Solution).Select(r => r.SolutionId!.Value).Distinct().ToList();

        var questionCounts = questionIds.Count == 0
            ? []
            : await db.Reports.AsNoTracking()
                .Where(r => r.Status == ReportStatus.Pending && r.TargetType == ReportTargetType.Question && questionIds.Contains(r.QuestionId))
                .GroupBy(r => r.QuestionId)
                .Select(g => new { Key = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var commentCounts = commentIds.Count == 0
            ? []
            : await db.Reports.AsNoTracking()
                .Where(r => r.Status == ReportStatus.Pending && r.TargetType == ReportTargetType.Comment && commentIds.Contains(r.CommentId!.Value))
                .GroupBy(r => r.CommentId!.Value)
                .Select(g => new { Key = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var solutionCounts = solutionIds.Count == 0
            ? []
            : await db.Reports.AsNoTracking()
                .Where(r => r.Status == ReportStatus.Pending && r.TargetType == ReportTargetType.Solution && solutionIds.Contains(r.SolutionId!.Value))
                .GroupBy(r => r.SolutionId!.Value)
                .Select(g => new { Key = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        UserRefView? Person(int? id) => id is int value && people.TryGetValue(value, out var p) ? p : null;

        return rows.Select(r =>
        {
            var pending = r.TargetType switch
            {
                ReportTargetType.Question => questionCounts.GetValueOrDefault(r.QuestionId),
                ReportTargetType.Comment => commentCounts.GetValueOrDefault(r.CommentId!.Value),
                _ => solutionCounts.GetValueOrDefault(r.SolutionId!.Value)
            };

            return new ReportItemView(
                r.Id,
                r.TargetType,
                r.Reason,
                r.Status,
                r.ActionTaken,
                r.CreatedAt,
                r.QuestionId,
                r.CommentId,
                r.SolutionId,
                Summarize(r.TargetSnapshot),
                r.Description,
                Person(r.ReporterUserId),
                Person(r.ReportedUserId),
                pending,
                r.ResolvedAt,
                Person(r.ResolvedByUserId),
                r.ResolutionNote,
                r.RowVersion);
        }).ToList();
    }

    private async Task<ReportQuestionTarget?> LoadQuestionTargetAsync(int questionId, CancellationToken cancellationToken)
    {
        var q = await db.Questions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == questionId, cancellationToken);
        if (q is null)
        {
            return null;
        }

        var distribution = await db.Answers.AsNoTracking()
            .Where(a => a.QuestionId == questionId)
            .GroupBy(a => a.SelectedOption)
            .Select(g => new AnswerDistributionView(g.Key, g.Count()))
            .ToListAsync(cancellationToken);
        var peopleIds = q.AnswerKeyReviewedByUserId is int reviewerId ? new[] { q.AuthorUserId, reviewerId } : [q.AuthorUserId];
        var people = await users.GetAsync(peopleIds, true, cancellationToken);

        return new ReportQuestionTarget(
            q.Id,
            q.Source,
            q.LessonId,
            people.GetValueOrDefault(q.AuthorUserId),
            q.Text,
            q.ImageFileId,
            await urls.GetOneAsync(q.ImageFileId, cancellationToken),
            q.OptionA,
            q.OptionB,
            q.OptionC,
            q.OptionD,
            q.CorrectOption,
            q.Description,
            q.IsHidden,
            q.IsAnswerDisputed,
            q.AiSuggestedOption,
            q.PublishedAt,
            distribution.Sum(d => d.Count),
            distribution.OrderBy(d => d.Option).ToList(),
            q.AnswerKeyReviewedAt,
            q.AnswerKeyReviewedByUserId is int reviewedBy ? people.GetValueOrDefault(reviewedBy) : null,
            q.AnswerKeyReviewNote,
            q.RowVersion);
    }

    private async Task<ReportCommentTarget?> LoadCommentTargetAsync(int commentId, CancellationToken cancellationToken)
    {
        var c = await db.Comments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == commentId, cancellationToken);
        if (c is null)
        {
            return null;
        }

        var people = await users.GetAsync([c.AuthorUserId], true, cancellationToken);
        return new ReportCommentTarget(c.Id, c.SolutionId, people.GetValueOrDefault(c.AuthorUserId), c.Body, c.Status, c.ModerationReason, c.CreatedAt);
    }

    private async Task<ReportSolutionTarget?> LoadSolutionTargetAsync(int solutionId, CancellationToken cancellationToken)
    {
        var s = await db.Solutions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == solutionId, cancellationToken);
        if (s is null)
        {
            return null;
        }

        var people = await users.GetAsync([s.AuthorUserId], true, cancellationToken);
        return new ReportSolutionTarget(s.Id, s.Type, people.GetValueOrDefault(s.AuthorUserId), s.Text, s.ImageFileId, await urls.GetOneAsync(s.ImageFileId, cancellationToken), s.IsHidden, s.IsDeleted, s.CreatedAt, s.UpdatedAt, s.RowVersion);
    }

    private static string? Summarize(string? snapshot)
    {
        if (snapshot is null || snapshot.Length <= SummaryMaxLength)
        {
            return snapshot;
        }

        var end = SummaryMaxLength;
        if (char.IsHighSurrogate(snapshot[end - 1]))
        {
            end--;
        }

        return snapshot[..end];
    }
}
