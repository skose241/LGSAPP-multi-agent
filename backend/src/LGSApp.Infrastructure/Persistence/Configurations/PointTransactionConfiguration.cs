using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class PointTransactionConfiguration : IEntityTypeConfiguration<PointTransaction>
{
    public void Configure(EntityTypeBuilder<PointTransaction> b)
    {
        b.ToTable("PointTransactions");
        b.HasKey(x => x.Id);
        b.Property(x => x.Reason).HasConversion<byte>();
        b.Property(x => x.LocalDate).HasColumnType("date");
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.RestrictToUser<PointTransaction>(x => x.UserId);
        b.RestrictToUser<PointTransaction>(x => x.CreatedByUserId);
        b.RestrictTo<PointTransaction, Question>(x => x.QuestionId);
        b.RestrictTo<PointTransaction, Answer>(x => x.AnswerId);
        b.RestrictTo<PointTransaction, Assignment>(x => x.AssignmentId);
        b.HasIndex(x => new { x.AnswerId, x.Reason }).IsUnique().HasFilter("[Reason] IN (1, 2) AND [AnswerId] IS NOT NULL").HasDatabaseName("UX_PointTransactions_Answer_Reason");
        b.HasIndex(x => new { x.QuestionId, x.Reason }).IsUnique().HasFilter("[Reason] = 3 AND [QuestionId] IS NOT NULL").HasDatabaseName("UX_PointTransactions_Question_Upload");
        b.HasIndex(x => x.LocalDate).IncludeProperties(x => new { x.UserId, x.Amount }).HasDatabaseName("IX_PointTransactions_LocalDate");
        b.HasIndex(x => new { x.UserId, x.CreatedAt }).HasDatabaseName("IX_PointTransactions_User_CreatedAt");
    }
}
