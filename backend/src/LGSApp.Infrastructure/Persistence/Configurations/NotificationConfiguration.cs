using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> b)
    {
        b.ToTable("Notifications");
        b.HasKey(x => x.Id);
        b.Property(x => x.Type).HasConversion<byte>();
        b.Property(x => x.Message).HasMaxLength(500).IsRequired();
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.RestrictToUser<Notification>(x => x.UserId);
        b.RestrictTo<Notification, Question>(x => x.QuestionId);
        b.RestrictTo<Notification, Assignment>(x => x.AssignmentId);
        b.RestrictTo<Notification, GenerationRun>(x => x.RunId);
        b.HasOne(x => x.Comment).WithMany().HasForeignKey(x => x.CommentId).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => new { x.UserId, x.IsRead, x.CreatedAt }).IsDescending(false, false, true).HasDatabaseName("IX_Notifications_User_IsRead_CreatedAt");
        b.HasIndex(x => new { x.UserId, x.Type, x.RunId }).IsUnique().HasFilter("[RunId] IS NOT NULL").HasDatabaseName("UX_Notifications_User_Type_Run");
    }
}
