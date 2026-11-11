using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class GenerationScheduleConfiguration : IEntityTypeConfiguration<GenerationSchedule>
{
    public void Configure(EntityTypeBuilder<GenerationSchedule> b)
    {
        b.ToTable("GenerationSchedules", t =>
        {
            t.HasCheckConstraint("CK_GenerationSchedules_DayOfWeek", "[DayOfWeek] BETWEEN 1 AND 7");
            t.HasCheckConstraint("CK_GenerationSchedules_QuestionCount", "[QuestionCount] BETWEEN 0 AND 20");
        });
        b.HasKey(x => new { x.DayOfWeek, x.LessonId });
        b.Property(x => x.DayOfWeek).ValueGeneratedNever();
        b.Property(x => x.LessonId).ValueGeneratedNever();
        b.RestrictTo<GenerationSchedule, Lesson>(x => x.LessonId);
    }
}
