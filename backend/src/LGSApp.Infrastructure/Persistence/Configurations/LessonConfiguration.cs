using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class LessonConfiguration : IEntityTypeConfiguration<Lesson>
{
    public void Configure(EntityTypeBuilder<Lesson> b)
    {
        b.ToTable("Lessons", t =>
        {
            t.HasCheckConstraint("CK_Lessons_Session", "[Session] IN (1, 2)");
        });
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(50).IsRequired();
        b.Property(x => x.Session).HasConversion<byte>();
        b.HasIndex(x => x.Name).IsUnique().HasDatabaseName("UX_Lessons_Name");
    }
}
