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
}

public sealed class ReportService(
    AppDbContext db,
    ISettingsService settings,
    IQuestionAccessService access,
    TurkeyTime clock) : IReportService
{
    private const int DescriptionColumnMaxLength = 500;

    private static readonly ReportReason[] CommentReasons = [ReportReason.Inappropriate, ReportReason.Spam, ReportReason.Other];

    public async Task<ServiceResult<ReportCreatedView>> CreateForCommentAsync(Actor actor, int commentId, CreateReportCommand command, CancellationToken cancellationToken = default)
    {
        if (!CommentReasons.Contains(command.Reason))
        {
            return Fail.Validation("Yorum şikayeti için geçerli nedenler: uygunsuz içerik, spam veya diğer.");
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

        var comment = await db.Comments.AsNoTracking()
            .Where(c => c.Id == commentId)
            .Select(c => new { c.Id, c.QuestionId, c.AuthorUserId, c.Body, c.Status })
            .FirstOrDefaultAsync(cancellationToken);
        if (comment is null)
        {
            return Fail.NotFound("Yorum bulunamadı.");
        }

        var gate = await access.RequireDiscussionAsync(comment.QuestionId, actor, "Yorumları görmek için önce soruyu cevaplamalısınız.", cancellationToken);
        if (!gate.Succeeded)
        {
            return ServiceResult<ReportCreatedView>.From(gate);
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

        var snapshot = comment.Body.Length > 1000 ? comment.Body[..1000] : comment.Body;
        var report = new Report
        {
            TargetType = ReportTargetType.Comment,
            QuestionId = comment.QuestionId,
            CommentId = comment.Id,
            ReportedUserId = comment.AuthorUserId,
            ReporterUserId = actor.UserId,
            Reason = command.Reason,
            Description = description,
            TargetSnapshot = snapshot,
            Status = ReportStatus.Pending,
            ActionTaken = ReportAction.None,
            CreatedAt = clock.UtcNow
        };
        db.Reports.Add(report);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation())
        {
            return Fail.Conflict("Bu yorumu zaten şikayet ettiniz.");
        }

        return ServiceResult<ReportCreatedView>.Ok(new ReportCreatedView(report.Id, report.Status, report.CreatedAt));
    }
}
