using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class TopicConfiguration : IEntityTypeConfiguration<Topic>
{
    public void Configure(EntityTypeBuilder<Topic> b)
    {
        b.ToTable("Topics");
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(150).IsRequired();
        b.HasAlternateKey(x => new { x.Id, x.LessonId }).HasName("AK_Topics_Id_LessonId");
        b.HasOne(x => x.Lesson).WithMany(l => l.Topics).HasForeignKey(x => x.LessonId).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => new { x.LessonId, x.Name }).IsUnique().HasDatabaseName("UX_Topics_LessonId_Name");
    }
}
