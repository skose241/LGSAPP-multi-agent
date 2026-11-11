using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class SettingConfiguration : IEntityTypeConfiguration<Setting>
{
    public void Configure(EntityTypeBuilder<Setting> b)
    {
        b.ToTable("Settings");
        b.HasKey(x => x.Key);
        b.Property(x => x.Key).HasMaxLength(50).ValueGeneratedNever();
        b.Property(x => x.Value).HasMaxLength(255).IsRequired();
        b.Property(x => x.Description).HasMaxLength(200);
        b.RestrictToUser<Setting>(x => x.UpdatedByUserId);
        b.HasData(SettingKeys.Defaults.Select(d => new Setting
        {
            Key = d.Key,
            Value = d.Value.ToString(),
            Description = d.Description
        }));
    }
}
