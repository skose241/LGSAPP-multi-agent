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
        b.RestrictToUser<AiLog>(x => x.UserId);
        b.RestrictTo<AiLog, Question>(x => x.QuestionId);
        b.HasIndex(x => new { x.UserId, x.Operation, x.CreatedAt }).HasDatabaseName("IX_AiLogs_User_Operation_CreatedAt");
    }
}
