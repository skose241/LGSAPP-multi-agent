using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class RecoveryCodeConfiguration : IEntityTypeConfiguration<RecoveryCode>
{
    public void Configure(EntityTypeBuilder<RecoveryCode> b)
    {
        b.ToTable("RecoveryCodes");
        b.HasKey(x => x.Id);
        b.Property(x => x.CodeHash).HasMaxLength(64).IsUnicode(false).IsRequired();
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => x.CodeHash).IsUnique().HasDatabaseName("UX_RecoveryCodes_CodeHash");
        b.HasIndex(x => new { x.UserId, x.UsedAt }).HasDatabaseName("IX_RecoveryCodes_User_UsedAt");
    }
}
