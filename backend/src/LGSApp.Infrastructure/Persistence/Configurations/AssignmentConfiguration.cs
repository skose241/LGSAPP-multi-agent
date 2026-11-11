using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class AssignmentConfiguration : IEntityTypeConfiguration<Assignment>
{
    public void Configure(EntityTypeBuilder<Assignment> b)
    {
        b.ToTable("Assignments", t =>
        {
            t.HasCheckConstraint("CK_Assignments_Dates", "[EndDate] >= [StartDate]");
            t.HasCheckConstraint("CK_Assignments_Status", "[Status] BETWEEN 0 AND 3");
        });
        b.HasKey(x => x.Id);
        b.Property(x => x.Title).HasMaxLength(150).IsRequired();
        b.Property(x => x.Description).HasMaxLength(1000);
        b.Property(x => x.StartDate).HasColumnType("date");
        b.Property(x => x.EndDate).HasColumnType("date");
        b.Property(x => x.Status).HasConversion<byte>();
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.Property(x => x.RowVersion).IsRowVersion();
        b.RestrictToUser<Assignment>(x => x.TeacherUserId);
        b.RestrictTo<Assignment, Lesson>(x => x.LessonId);
        b.HasIndex(x => new { x.Status, x.StartDate }).HasDatabaseName("IX_Assignments_Status_StartDate");
        b.HasIndex(x => new { x.Status, x.EndDate }).HasDatabaseName("IX_Assignments_Status_EndDate");
        b.HasIndex(x => new { x.TeacherUserId, x.Status }).HasDatabaseName("IX_Assignments_Teacher_Status");
    }
}

public class AssignmentQuestionConfiguration : IEntityTypeConfiguration<AssignmentQuestion>
{
    public void Configure(EntityTypeBuilder<AssignmentQuestion> b)
    {
        b.ToTable("AssignmentQuestions");
        b.HasKey(x => new { x.AssignmentId, x.QuestionId });
        b.RestrictTo<AssignmentQuestion, Assignment>(x => x.AssignmentId);
        b.RestrictTo<AssignmentQuestion, Question>(x => x.QuestionId);
        b.HasIndex(x => x.QuestionId).IsUnique().HasDatabaseName("UX_AssignmentQuestions_QuestionId");
        b.HasIndex(x => new { x.AssignmentId, x.OrderNo }).IsUnique().HasDatabaseName("UX_AssignmentQuestions_Assignment_OrderNo");
    }
}
