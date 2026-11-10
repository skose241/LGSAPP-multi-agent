using AppRoles = LGSApp.Domain.Constants.Roles;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, int>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<PasswordResetRequest> PasswordResetRequests => Set<PasswordResetRequest>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>(b =>
        {
            b.Property(u => u.FirstName).HasMaxLength(100).IsRequired();
            b.Property(u => u.LastName).HasMaxLength(100).IsRequired();
            b.Property(u => u.ClassName).HasMaxLength(50);
            b.Property(u => u.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
            b.Property(u => u.UserName).HasMaxLength(UserNameRules.MaxLength);
            b.Property(u => u.NormalizedUserName).HasMaxLength(UserNameRules.MaxLength);
            b.Ignore(u => u.Email);
            b.Ignore(u => u.NormalizedEmail);
            b.Ignore(u => u.EmailConfirmed);
            b.Ignore(u => u.PhoneNumber);
            b.Ignore(u => u.PhoneNumberConfirmed);
        });

        builder.Entity<PasswordResetRequest>(b =>
        {
            b.ToTable("PasswordResetRequests");
            b.HasKey(r => r.Id);
            b.Property(r => r.Status).HasConversion<byte>();
            b.Property(r => r.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
            b.Property(r => r.RowVersion).IsRowVersion();
            b.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<ApplicationUser>().WithMany().HasForeignKey(r => r.ProcessedByUserId).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(r => r.UserId).IsUnique().HasFilter("[Status] = 0").HasDatabaseName("UX_PasswordResetRequests_UserId_Pending");
            b.HasIndex(r => new { r.Status, r.CreatedAt });
        });

        builder.Entity<ApplicationRole>().HasData(
            new ApplicationRole { Id = AppRoles.MudurId, Name = AppRoles.Mudur, NormalizedName = AppRoles.Mudur.ToUpperInvariant(), ConcurrencyStamp = "role-mudur-v1" },
            new ApplicationRole { Id = AppRoles.OgretmenId, Name = AppRoles.Ogretmen, NormalizedName = AppRoles.Ogretmen.ToUpperInvariant(), ConcurrencyStamp = "role-ogretmen-v1" },
            new ApplicationRole { Id = AppRoles.OgrenciId, Name = AppRoles.Ogrenci, NormalizedName = AppRoles.Ogrenci.ToUpperInvariant(), ConcurrencyStamp = "role-ogrenci-v1" },
            new ApplicationRole { Id = AppRoles.AiId, Name = AppRoles.Ai, NormalizedName = AppRoles.Ai.ToUpperInvariant(), ConcurrencyStamp = "role-ai-v1" });
    }
}
