using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class SolutionConfiguration : IEntityTypeConfiguration<Solution>
{
    public void Configure(EntityTypeBuilder<Solution> b)
    {
        b.ToTable("Solutions", t =>
        {
            t.HasCheckConstraint("CK_Solutions_Type", "[Type] IN (2, 3, 4)");
            t.HasCheckConstraint("CK_Solutions_TextOrImage", "[Text] IS NOT NULL OR [ImageFileId] IS NOT NULL");
            t.HasCheckConstraint("CK_Solutions_StudentAnswer", "([Type] = 3 AND [AnswerId] IS NOT NULL) OR ([Type] <> 3 AND [AnswerId] IS NULL)");
        });
        b.HasKey(x => x.Id);
        b.Property(x => x.Type).HasConversion<byte>();
        b.Property(x => x.Text).HasColumnType("nvarchar(max)");
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.Property(x => x.RowVersion).IsRowVersion();
        b.HasAlternateKey(x => new { x.Id, x.QuestionId }).HasName("AK_Solutions_Id_QuestionId");
        b.RestrictTo<Solution, Question>(x => x.QuestionId);
        b.HasOne(x => x.Author).WithMany().HasForeignKey(x => x.AuthorUserId).OnDelete(DeleteBehavior.Restrict);
        b.RestrictTo<Solution, Answer>(x => x.AnswerId);
        b.RestrictTo<Solution, StoredFile>(x => x.ImageFileId);
        b.HasIndex(x => new { x.QuestionId, x.Type }).IsUnique().HasFilter("[Type] IN (2, 4) AND [IsDeleted] = 0").HasDatabaseName("UX_Solutions_Question_Type_TeacherAi");
        b.HasIndex(x => new { x.QuestionId, x.AuthorUserId }).IsUnique().HasFilter("[Type] = 3").HasDatabaseName("UX_Solutions_Question_Author_Student");
        b.HasIndex(x => x.AnswerId).IsUnique().HasFilter("[AnswerId] IS NOT NULL").HasDatabaseName("UX_Solutions_AnswerId");
    }
}
