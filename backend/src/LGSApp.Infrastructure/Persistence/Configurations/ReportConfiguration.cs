using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class ReportConfiguration : IEntityTypeConfiguration<Report>
{
    public void Configure(EntityTypeBuilder<Report> b)
    {
        b.ToTable("Reports", t =>
        {
            t.HasCheckConstraint("CK_Reports_Target", "([TargetType] = 1 AND [CommentId] IS NULL AND [SolutionId] IS NULL) OR ([TargetType] = 2 AND [CommentId] IS NOT NULL AND [SolutionId] IS NULL) OR ([TargetType] = 3 AND [SolutionId] IS NOT NULL AND [CommentId] IS NULL)");
            t.HasCheckConstraint("CK_Reports_Status", "[Status] IN (0, 1, 2)");
        });
        b.HasKey(x => x.Id);
        b.Property(x => x.TargetType).HasConversion<byte>();
        b.Property(x => x.Reason).HasConversion<byte>();
        b.Property(x => x.Status).HasConversion<byte>();
        b.Property(x => x.ActionTaken).HasConversion<byte>();
        b.Property(x => x.Description).HasMaxLength(500).IsRequired();
        b.Property(x => x.TargetSnapshot).HasMaxLength(1000);
        b.Property(x => x.ResolutionNote).HasMaxLength(500);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.Property(x => x.RowVersion).IsRowVersion();

        b.RestrictTo<Report, Question>(x => x.QuestionId);
        b.RestrictTo<Report, Comment>(x => x.CommentId);
        b.RestrictTo<Report, Solution>(x => x.SolutionId);
        b.RestrictToUser<Report>(x => x.ReportedUserId);
        b.RestrictToUser<Report>(x => x.ReporterUserId);
        b.RestrictToUser<Report>(x => x.ResolvedByUserId);

        b.HasIndex(x => new { x.ReporterUserId, x.QuestionId }).IsUnique().HasFilter("[TargetType] = 1").HasDatabaseName("UX_Reports_Reporter_Question");
        b.HasIndex(x => new { x.ReporterUserId, x.CommentId }).IsUnique().HasFilter("[TargetType] = 2").HasDatabaseName("UX_Reports_Reporter_Comment");
        b.HasIndex(x => new { x.ReporterUserId, x.SolutionId }).IsUnique().HasFilter("[TargetType] = 3").HasDatabaseName("UX_Reports_Reporter_Solution");
        b.HasIndex(x => new { x.Status, x.TargetType, x.CreatedAt }).HasDatabaseName("IX_Reports_Status_Target_CreatedAt");
        b.HasIndex(x => new { x.ReportedUserId, x.Status }).HasDatabaseName("IX_Reports_ReportedUser_Status");

    }
}
