using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class DailyTopicPlanConfiguration : IEntityTypeConfiguration<DailyTopicPlan>
{
    public void Configure(EntityTypeBuilder<DailyTopicPlan> b)
    {
        b.ToTable("DailyTopicPlans");
        b.HasKey(x => x.Id);
        b.Property(x => x.PlanDate).HasColumnType("date");
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.Property(x => x.RowVersion).IsRowVersion();
        b.RestrictTo<DailyTopicPlan, Lesson>(x => x.LessonId);
        b.HasOne<Topic>().WithMany().HasForeignKey(x => new { x.TopicId, x.LessonId }).HasPrincipalKey(t => new { t.Id, t.LessonId }).OnDelete(DeleteBehavior.Restrict);
        b.RestrictToUser<DailyTopicPlan>(x => x.PlannedByUserId);
        b.HasIndex(x => new { x.PlanDate, x.LessonId }).IsUnique().HasDatabaseName("UX_DailyTopicPlans_Date_Lesson");
    }
}

public class GenerationRunConfiguration : IEntityTypeConfiguration<GenerationRun>
{
    public void Configure(EntityTypeBuilder<GenerationRun> b)
    {
        b.ToTable("GenerationRuns");
        b.HasKey(x => x.Id);
        b.Property(x => x.RunDate).HasColumnType("date");
        b.Property(x => x.Kind).HasConversion<byte>();
        b.Property(x => x.Trigger).HasConversion<byte>();
        b.Property(x => x.Status).HasConversion<byte>();
        b.Property(x => x.Summary).HasMaxLength(1000);
        b.Property(x => x.StartedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.Property(x => x.RowVersion).IsRowVersion();
        b.RestrictToUser<GenerationRun>(x => x.TriggeredByUserId);
        b.HasIndex(x => x.Kind).IsUnique().HasFilter("[Status] = 0").HasDatabaseName("UX_GenerationRuns_Kind_Running");
        b.HasIndex(x => new { x.Kind, x.RunDate })
            .IncludeProperties(x => new { x.Status, x.Trigger, x.FinishedAt, x.SucceededCount })
            .HasDatabaseName("IX_GenerationRuns_Kind_RunDate");
        b.HasIndex(x => x.StartedAt).IsDescending().HasDatabaseName("IX_GenerationRuns_StartedAt");
    }
}

public class GenerationLogConfiguration : IEntityTypeConfiguration<GenerationLog>
{
    public void Configure(EntityTypeBuilder<GenerationLog> b)
    {
        b.ToTable("GenerationLogs");
        b.HasKey(x => x.Id);
        b.Property(x => x.RunDate).HasColumnType("date");
        b.Property(x => x.Status).HasConversion<byte>();
        b.Property(x => x.ErrorMessage).HasMaxLength(2000);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.RestrictTo<GenerationLog, GenerationRun>(x => x.RunId);
        b.RestrictTo<GenerationLog, Lesson>(x => x.LessonId);
        b.RestrictTo<GenerationLog, Topic>(x => x.TopicId);
        b.RestrictTo<GenerationLog, Question>(x => x.QuestionId);
        b.HasIndex(x => new { x.RunDate, x.LessonId, x.Status }).HasDatabaseName("IX_GenerationLogs_Date_Lesson_Status");
    }
}

public class AiLogConfiguration : IEntityTypeConfiguration<AiLog>
{
    public void Configure(EntityTypeBuilder<AiLog> b)
    {
        b.ToTable("AiLogs");
        b.HasKey(x => x.Id);
        b.Property(x => x.Operation).HasConversion<byte>();
        b.Property(x => x.Model).HasMaxLength(50);
        b.Property(x => x.Input).HasColumnType("nvarchar(max)");
        b.Property(x => x.Output).HasColumnType("nvarchar(max)");
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.Property(x => x.Status).HasConversion<byte>().HasDefaultValue(AiLogStatus.Succeeded).HasSentinel(AiLogStatus.Succeeded);
        b.Property(x => x.ErrorKind).HasConversion<byte>().HasDefaultValue(AiErrorKind.None);
        b.Property(x => x.ErrorMessage).HasMaxLength(2000);
        b.Property(x => x.AttemptCount).HasDefaultValue((byte)1).HasSentinel((byte)1);
        b.Property(x => x.CostUsd).HasPrecision(12, 6);
        b.Property(x => x.CountsTowardLimit).HasDefaultValue(false);
        b.Property(x => x.ModelVersion).HasMaxLength(80);
        b.RestrictToUser<AiLog>(x => x.UserId);
        b.RestrictTo<AiLog, Question>(x => x.QuestionId);
        b.RestrictTo<AiLog, Solution>(x => x.SolutionId);
        b.RestrictTo<AiLog, StoredFile>(x => x.ImageFileId);
        b.HasIndex(x => new { x.UserId, x.Operation, x.CreatedAt }).HasDatabaseName("IX_AiLogs_User_Operation_CreatedAt");
        b.HasIndex(x => new { x.Operation, x.CreatedAt })
            .IncludeProperties(x => new { x.CountsTowardLimit, x.CostUsd })
            .HasDatabaseName("IX_AiLogs_Operation_CreatedAt");
        b.HasIndex(x => new { x.QuestionId, x.Operation, x.CreatedAt }).HasDatabaseName("IX_AiLogs_Question_Operation_CreatedAt");
        b.HasIndex(x => new { x.Status, x.CreatedAt }).HasFilter("[Status] = 0").HasDatabaseName("IX_AiLogs_Pending");
    }
}
