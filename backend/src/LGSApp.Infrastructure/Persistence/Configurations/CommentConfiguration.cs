using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class CommentConfiguration : IEntityTypeConfiguration<Comment>
{
    public void Configure(EntityTypeBuilder<Comment> b)
    {
        b.ToTable("Comments", t =>
        {
            t.HasCheckConstraint("CK_Comments_Status", "[Status] IN (0, 1, 2)");
            t.HasCheckConstraint("CK_Comments_Tree", "([ParentId] IS NULL AND [RootId] IS NULL AND [Depth] = 0) OR ([ParentId] IS NOT NULL AND [RootId] IS NOT NULL AND [Depth] BETWEEN 1 AND 10)");
        });
        b.HasKey(x => x.Id);
        b.Property(x => x.Body).HasMaxLength(800).IsRequired();
        b.Property(x => x.Status).HasConversion<byte>();
        b.Property(x => x.ModerationReason).HasMaxLength(300);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.Property(x => x.RowVersion).IsRowVersion();
        b.HasAlternateKey(x => new { x.Id, x.QuestionId }).HasName("AK_Comments_Id_QuestionId");

        b.RestrictTo<Comment, Question>(x => x.QuestionId);
        b.HasOne<Solution>().WithMany().HasForeignKey(x => new { x.SolutionId, x.QuestionId }).HasPrincipalKey(s => new { s.Id, s.QuestionId }).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Comment>().WithMany().HasForeignKey(x => new { x.ParentId, x.QuestionId }).HasPrincipalKey(c => new { c.Id, c.QuestionId }).OnDelete(DeleteBehavior.Restrict);
        b.RestrictTo<Comment, Comment>(x => x.RootId);
        b.HasOne(x => x.Author).WithMany().HasForeignKey(x => x.AuthorUserId).OnDelete(DeleteBehavior.Restrict);
        b.RestrictToUser<Comment>(x => x.ReplyToUserId);
        b.RestrictToUser<Comment>(x => x.DeletedByUserId);

        b.HasIndex(x => new { x.QuestionId, x.SolutionId, x.CreatedAt, x.Id }).HasFilter("[ParentId] IS NULL").HasDatabaseName("IX_Comments_Roots");
        b.HasIndex(x => new { x.RootId, x.CreatedAt }).HasFilter("[RootId] IS NOT NULL").HasDatabaseName("IX_Comments_Root_CreatedAt");
        b.HasIndex(x => x.ParentId).HasDatabaseName("IX_Comments_ParentId");
        b.HasIndex(x => new { x.AuthorUserId, x.CreatedAt }).HasDatabaseName("IX_Comments_Author_CreatedAt");

    }
}
