using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class AnswerConfiguration : IEntityTypeConfiguration<Answer>
{
    public void Configure(EntityTypeBuilder<Answer> b)
    {
        b.ToTable("Answers", t =>
        {
            t.HasCheckConstraint("CK_Answers_SelectedOption", "[SelectedOption] BETWEEN 1 AND 4");
        });
        b.HasKey(x => x.Id);
        b.Property(x => x.AnsweredAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.RestrictTo<Answer, Question>(x => x.QuestionId);
        b.RestrictToUser<Answer>(x => x.UserId);
        b.HasOne<AssignmentQuestion>().WithMany().HasForeignKey(x => new { x.AssignmentId, x.QuestionId }).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => new { x.QuestionId, x.UserId }).IsUnique().HasDatabaseName("UX_Answers_Question_User");
        b.HasIndex(x => new { x.UserId, x.AnsweredAt }).HasDatabaseName("IX_Answers_User_AnsweredAt");
        b.HasIndex(x => new { x.AssignmentId, x.UserId }).HasDatabaseName("IX_Answers_Assignment_User");
        b.HasIndex(x => x.QuestionId).IncludeProperties(x => x.IsCorrect).HasDatabaseName("IX_Answers_Question_Include_IsCorrect");
    }
}
