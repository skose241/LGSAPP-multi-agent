using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> b)
    {
        b.ToTable("RefreshTokens");
        b.HasKey(x => x.Id);
        b.Property(x => x.TokenHash).HasMaxLength(64).IsFixedLength().IsUnicode(false).IsRequired();
        b.Property(x => x.SecurityStampHash).HasMaxLength(64).IsFixedLength().IsUnicode(false).IsRequired();
        b.Property(x => x.RevokedReason).HasMaxLength(32).IsUnicode(false);
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => x.TokenHash).IsUnique().HasDatabaseName("UX_RefreshTokens_TokenHash");
        b.HasIndex(x => new { x.UserId, x.RevokedAt }).HasDatabaseName("IX_RefreshTokens_User_RevokedAt");
        b.HasIndex(x => x.FamilyId).HasDatabaseName("IX_RefreshTokens_FamilyId");
    }
}
