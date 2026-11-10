using AppRoles = LGSApp.Domain.Constants.Roles;
using LGSApp.Domain.Entities;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, int>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>(b =>
        {
            b.Property(u => u.FirstName).HasMaxLength(100).IsRequired();
            b.Property(u => u.LastName).HasMaxLength(100).IsRequired();
            b.Property(u => u.ClassName).HasMaxLength(50);
            b.Property(u => u.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        });

        builder.Entity<ApplicationRole>().HasData(
            new ApplicationRole { Id = AppRoles.MudurId, Name = AppRoles.Mudur, NormalizedName = AppRoles.Mudur.ToUpperInvariant(), ConcurrencyStamp = "role-mudur-v1" },
            new ApplicationRole { Id = AppRoles.OgretmenId, Name = AppRoles.Ogretmen, NormalizedName = AppRoles.Ogretmen.ToUpperInvariant(), ConcurrencyStamp = "role-ogretmen-v1" },
            new ApplicationRole { Id = AppRoles.OgrenciId, Name = AppRoles.Ogrenci, NormalizedName = AppRoles.Ogrenci.ToUpperInvariant(), ConcurrencyStamp = "role-ogrenci-v1" },
            new ApplicationRole { Id = AppRoles.AiId, Name = AppRoles.Ai, NormalizedName = AppRoles.Ai.ToUpperInvariant(), ConcurrencyStamp = "role-ai-v1" });
    }
}
