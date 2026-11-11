using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class QuestionConfiguration : IEntityTypeConfiguration<Question>
{
    public void Configure(EntityTypeBuilder<Question> b)
    {
        b.ToTable("Questions", t =>
        {
            t.HasCheckConstraint("CK_Questions_Source", "[Source] IN (2, 3, 4)");
            t.HasCheckConstraint("CK_Questions_CorrectOption", "[CorrectOption] BETWEEN 1 AND 4");
            t.HasCheckConstraint("CK_Questions_AiSuggestedOption", "[AiSuggestedOption] IS NULL OR [AiSuggestedOption] BETWEEN 1 AND 4");
            t.HasCheckConstraint("CK_Questions_TextOrImage", "[Text] IS NOT NULL OR [ImageFileId] IS NOT NULL");
            t.HasCheckConstraint("CK_Questions_AiGeneration", "([Source] = 4 AND [GenerationDate] IS NOT NULL AND [GenerationSlot] IS NOT NULL) OR ([Source] <> 4 AND [GenerationDate] IS NULL AND [GenerationSlot] IS NULL)");
        });
        b.HasKey(x => x.Id);
        b.Property(x => x.Source).HasConversion<byte>();
        b.Property(x => x.Text).HasColumnType("nvarchar(max)");
        b.Property(x => x.OptionA).HasMaxLength(500);
        b.Property(x => x.OptionB).HasMaxLength(500);
        b.Property(x => x.OptionC).HasMaxLength(500);
        b.Property(x => x.OptionD).HasMaxLength(500);
        b.Property(x => x.Description).HasMaxLength(2000);
        b.Property(x => x.ScheduledPublishDate).HasColumnType("date");
        b.Property(x => x.GenerationDate).HasColumnType("date");
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.Property(x => x.RowVersion).IsRowVersion();

        b.HasOne(x => x.Author).WithMany().HasForeignKey(x => x.AuthorUserId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Lesson).WithMany().HasForeignKey(x => x.LessonId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Topic>().WithMany().HasForeignKey(x => new { x.TopicId, x.LessonId }).HasPrincipalKey(t => new { t.Id, t.LessonId }).OnDelete(DeleteBehavior.Restrict);
        b.RestrictTo<Question, StoredFile>(x => x.ImageFileId);
        b.RestrictToUser<Question>(x => x.HiddenByUserId);
        b.RestrictToUser<Question>(x => x.CorrectOptionChangedByUserId);

        b.HasIndex(x => x.ImageFileId).IsUnique().HasFilter("[ImageFileId] IS NOT NULL").HasDatabaseName("UX_Questions_ImageFileId");
        b.HasIndex(x => new { x.LessonId, x.GenerationDate, x.GenerationSlot }).IsUnique().HasFilter("[Source] = 4").HasDatabaseName("UX_Questions_Ai_Lesson_Date_Slot");
        b.HasIndex(x => new { x.LessonId, x.PublishedAt }).HasFilter("[IsHidden] = 0").HasDatabaseName("IX_Questions_Lesson_PublishedAt");
        b.HasIndex(x => x.ScheduledPublishDate).HasFilter("[PublishedAt] IS NULL").HasDatabaseName("IX_Questions_ScheduledPublishDate_Unpublished");
        b.HasIndex(x => new { x.AuthorUserId, x.CreatedAt }).HasDatabaseName("IX_Questions_Author_CreatedAt");
        b.HasIndex(x => x.IsAnswerDisputed).HasFilter("[IsAnswerDisputed] = 1").HasDatabaseName("IX_Questions_AnswerDisputed");

    }
}
