using System.Text;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Reports;

public sealed record CreateReportCommand(ReportReason Reason, string Description);

public sealed record ReportCreatedView(int Id, ReportStatus Status, DateTime CreatedAt);

public interface IReportService
{
    Task<ServiceResult<ReportCreatedView>> CreateForCommentAsync(Actor actor, int commentId, CreateReportCommand command, CancellationToken cancellationToken = default);
    Task<ServiceResult<ReportCreatedView>> CreateForQuestionAsync(Actor actor, int questionId, CreateReportCommand command, CancellationToken cancellationToken = default);
    Task<ServiceResult<ReportCreatedView>> CreateForSolutionAsync(Actor actor, int solutionId, CreateReportCommand command, CancellationToken cancellationToken = default);
}

public sealed class ReportService(
    AppDbContext db,
    ISettingsService settings,
    IQuestionAccessService access,
    TurkeyTime clock) : IReportService
{
    private const int DescriptionColumnMaxLength = 500;

    private const int SnapshotMaxLength = 1000;
    private const int SnapshotTextMaxLength = 500;
    private const int SnapshotOptionMaxLength = 100;

    private static readonly ReportReason[] CommentReasons = [ReportReason.Inappropriate, ReportReason.Spam, ReportReason.Other];

    private static readonly ReportReason[] SolutionReasons = [ReportReason.Unreadable, ReportReason.Incomplete, ReportReason.Inappropriate, ReportReason.Spam, ReportReason.Other];

    public async Task<ServiceResult<ReportCreatedView>> CreateForCommentAsync(Actor actor, int commentId, CreateReportCommand command, CancellationToken cancellationToken = default)
    {
        var prepared = await PrepareAsync(actor, command, CommentReasons, "Yorum şikayeti için geçerli nedenler: uygunsuz içerik, spam veya diğer.", cancellationToken);
        if (!prepared.Succeeded)
        {
            return ServiceResult<ReportCreatedView>.From(prepared);
        }

        var description = prepared.Value!;

        var comment = await db.Comments.AsNoTracking()
            .Where(c => c.Id == commentId)
            .Select(c => new { c.Id, c.QuestionId, c.SolutionId, c.AuthorUserId, c.Body, c.Status })
            .FirstOrDefaultAsync(cancellationToken);
        if (comment is null)
        {
            return Fail.NotFound("Yorum bulunamadı.");
        }

        var decision = await access.GetAsync(comment.QuestionId, actor, cancellationToken);
        if (decision is null || !decision.CanSeeDiscussion)
        {
            return Fail.NotFound("Yorum bulunamadı.");
        }

        if (comment.SolutionId is int solutionId)
        {
            var solutionUsable = await db.Solutions.AsNoTracking().AnyAsync(
                s => s.Id == solutionId && s.QuestionId == comment.QuestionId && !s.IsDeleted && (actor.IsModerator || !s.IsHidden),
                cancellationToken);
            if (!solutionUsable)
            {
                return Fail.NotFound("Yorum bulunamadı.");
            }
        }

        if (comment.AuthorUserId == actor.UserId)
        {
            return Fail.Validation("Kendi yorumunuzu şikayet edemezsiniz.");
        }

        if (comment.Status != CommentStatus.Active)
        {
            return Fail.Conflict("Bu yorum artık yayında değil.");
        }

        var duplicate = await db.Reports.AnyAsync(
            r => r.ReporterUserId == actor.UserId && r.TargetType == ReportTargetType.Comment && r.CommentId == commentId,
            cancellationToken);
        if (duplicate)
        {
            return Fail.Conflict("Bu yorumu zaten şikayet ettiniz.");
        }

        var report = new Report
        {
            TargetType = ReportTargetType.Comment,
            QuestionId = comment.QuestionId,
            CommentId = comment.Id,
            ReportedUserId = comment.AuthorUserId
        };
        return await SaveAsync(report, actor, command.Reason, description, Truncate(comment.Body, SnapshotMaxLength), "Bu yorumu zaten şikayet ettiniz.", cancellationToken);
    }

    public async Task<ServiceResult<ReportCreatedView>> CreateForQuestionAsync(Actor actor, int questionId, CreateReportCommand command, CancellationToken cancellationToken = default)
    {
        var prepared = await PrepareAsync(actor, command, null, string.Empty, cancellationToken);
        if (!prepared.Succeeded)
        {
            return ServiceResult<ReportCreatedView>.From(prepared);
        }

        var description = prepared.Value!;

        var decision = await access.GetAsync(questionId, actor, cancellationToken);
        if (decision is null || !decision.CanSeeDiscussion)
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        var question = await db.Questions.AsNoTracking()
            .Where(q => q.Id == questionId)
            .Select(q => new { q.Id, q.AuthorUserId, q.Text, q.OptionA, q.OptionB, q.OptionC, q.OptionD, q.CorrectOption })
            .FirstOrDefaultAsync(cancellationToken);
        if (question is null)
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        if (question.AuthorUserId == actor.UserId)
        {
            return Fail.Validation("Kendi sorunuzu şikayet edemezsiniz.");
        }

        var duplicate = await db.Reports.AnyAsync(
            r => r.ReporterUserId == actor.UserId && r.TargetType == ReportTargetType.Question && r.QuestionId == questionId,
            cancellationToken);
        if (duplicate)
        {
            return Fail.Conflict("Bu soruyu zaten şikayet ettiniz.");
        }

        var report = new Report
        {
            TargetType = ReportTargetType.Question,
            QuestionId = question.Id,
            ReportedUserId = question.AuthorUserId
        };
        var snapshot = BuildQuestionSnapshot(question.Text, question.OptionA, question.OptionB, question.OptionC, question.OptionD, question.CorrectOption);
        return await SaveAsync(report, actor, command.Reason, description, snapshot, "Bu soruyu zaten şikayet ettiniz.", cancellationToken);
    }

    public async Task<ServiceResult<ReportCreatedView>> CreateForSolutionAsync(Actor actor, int solutionId, CreateReportCommand command, CancellationToken cancellationToken = default)
    {
        var prepared = await PrepareAsync(actor, command, SolutionReasons, "Çözüm şikayeti için geçerli nedenler: okunaksız, eksik, uygunsuz içerik, spam veya diğer.", cancellationToken);
        if (!prepared.Succeeded)
        {
            return ServiceResult<ReportCreatedView>.From(prepared);
        }

        var description = prepared.Value!;

        var solution = await db.Solutions.AsNoTracking()
            .Where(s => s.Id == solutionId && !s.IsDeleted && (actor.IsModerator || !s.IsHidden))
            .Select(s => new { s.Id, s.QuestionId, s.AuthorUserId, s.Text })
            .FirstOrDefaultAsync(cancellationToken);
        if (solution is null)
        {
            return Fail.NotFound("Çözüm bulunamadı.");
        }

        var decision = await access.GetAsync(solution.QuestionId, actor, cancellationToken);
        if (decision is null || !decision.CanSeeDiscussion)
        {
            return Fail.NotFound("Çözüm bulunamadı.");
        }

        if (solution.AuthorUserId == actor.UserId)
        {
            return Fail.Validation("Kendi çözümünüzü şikayet edemezsiniz.");
        }

        var duplicate = await db.Reports.AnyAsync(
            r => r.ReporterUserId == actor.UserId && r.TargetType == ReportTargetType.Solution && r.SolutionId == solutionId,
            cancellationToken);
        if (duplicate)
        {
            return Fail.Conflict("Bu çözümü zaten şikayet ettiniz.");
        }

        var report = new Report
        {
            TargetType = ReportTargetType.Solution,
            QuestionId = solution.QuestionId,
            SolutionId = solution.Id,
            ReportedUserId = solution.AuthorUserId
        };
        var snapshot = solution.Text is null ? "[Metinsiz çözüm]" : Truncate(solution.Text, SnapshotMaxLength);
        return await SaveAsync(report, actor, command.Reason, description, snapshot, "Bu çözümü zaten şikayet ettiniz.", cancellationToken);
    }

    private async Task<ServiceResult<string>> PrepareAsync(Actor actor, CreateReportCommand command, ReportReason[]? allowedReasons, string invalidReasonMessage, CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(command.Reason))
        {
            return Fail.Validation("Geçersiz şikayet nedeni.");
        }

        if (allowedReasons is not null && !allowedReasons.Contains(command.Reason))
        {
            return Fail.Validation(invalidReasonMessage);
        }

        if (actor.IsModerator)
        {
            return Fail.Forbidden("Öğretmen ve müdür şikayet oluşturamaz; içeriği doğrudan yönetebilir.");
        }

        var minLength = await settings.GetIntAsync(SettingKeys.SikayetMinKarakter, cancellationToken);
        var description = (command.Description ?? string.Empty).Trim();
        if (description.Length < minLength)
        {
            return Fail.Validation($"Şikayet açıklaması en az {minLength} karakter olmalıdır.");
        }

        if (description.Length > DescriptionColumnMaxLength)
        {
            return Fail.Validation($"Şikayet açıklaması en fazla {DescriptionColumnMaxLength} karakter olabilir.");
        }

        return ServiceResult<string>.Ok(description);
    }

    private async Task<ServiceResult<ReportCreatedView>> SaveAsync(Report report, Actor actor, ReportReason reason, string description, string snapshot, string duplicateMessage, CancellationToken cancellationToken)
    {
        report.ReporterUserId = actor.UserId;
        report.Reason = reason;
        report.Description = description;
        report.TargetSnapshot = snapshot;
        report.Status = ReportStatus.Pending;
        report.ActionTaken = ReportAction.None;
        report.CreatedAt = clock.UtcNow;
        db.Reports.Add(report);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation())
        {
            return Fail.Conflict(duplicateMessage);
        }

        return ServiceResult<ReportCreatedView>.Ok(new ReportCreatedView(report.Id, report.Status, report.CreatedAt));
    }

    private static string BuildQuestionSnapshot(string? text, string? a, string? b, string? c, string? d, byte correct)
    {
        var builder = new StringBuilder();
        builder.Append(text is null ? "[Görsel soru]" : Truncate(text, SnapshotTextMaxLength));
        AppendOption(builder, 'A', a);
        AppendOption(builder, 'B', b);
        AppendOption(builder, 'C', c);
        AppendOption(builder, 'D', d);
        builder.Append("\nDoğru şık: ").Append(correct is >= 1 and <= 4 ? (char)('A' + correct - 1) : '?');
        return Truncate(builder.ToString(), SnapshotMaxLength);
    }

    private static void AppendOption(StringBuilder builder, char label, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            builder.Append('\n').Append(label).Append(") ").Append(Truncate(value, SnapshotOptionMaxLength));
        }
    }

    private static string Truncate(string value, int maxLength)
    {
        if (value.Length <= maxLength)
        {
            return value;
        }

        var end = maxLength;
        if (char.IsHighSurrogate(value[end - 1]))
        {
            end--;
        }

        return value[..end];
    }
}
