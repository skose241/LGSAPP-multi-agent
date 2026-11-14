using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class StoredFileConfiguration : IEntityTypeConfiguration<StoredFile>
{
    public void Configure(EntityTypeBuilder<StoredFile> b)
    {
        b.ToTable("StoredFiles", t =>
        {
            t.HasCheckConstraint("CK_StoredFiles_ReadyHasMetadata", "[Status] <> 1 OR ([Width] IS NOT NULL AND [Height] IS NOT NULL AND [ConfirmedAt] IS NOT NULL)");
            t.HasCheckConstraint(
                "CK_StoredFiles_ThumbnailComplete",
                "([ThumbnailBlobName] IS NULL AND [ThumbnailWidth] IS NULL AND [ThumbnailHeight] IS NULL AND [ThumbnailSizeBytes] IS NULL) OR ([ThumbnailBlobName] IS NOT NULL AND [ThumbnailWidth] IS NOT NULL AND [ThumbnailHeight] IS NOT NULL AND [ThumbnailSizeBytes] IS NOT NULL)");
        });
        b.HasKey(x => x.Id);
        b.Property(x => x.Container).HasMaxLength(63).IsRequired();
        b.Property(x => x.BlobName).HasMaxLength(400).IsRequired();
        b.Property(x => x.ThumbnailBlobName).HasMaxLength(400);
        b.Property(x => x.ContentType).HasMaxLength(100).IsRequired();
        b.Property(x => x.Purpose).HasConversion<byte>();
        b.Property(x => x.Status).HasConversion<byte>();
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.RestrictToUser<StoredFile>(x => x.UploadedByUserId);
        b.HasIndex(x => x.BlobName).IsUnique().HasDatabaseName("UX_StoredFiles_BlobName");
        b.HasIndex(x => x.ThumbnailBlobName).IsUnique().HasFilter("[ThumbnailBlobName] IS NOT NULL").HasDatabaseName("UX_StoredFiles_ThumbnailBlobName");
        b.HasIndex(x => new { x.UploadedByUserId, x.ClientUploadId }).IsUnique().HasFilter("[ClientUploadId] IS NOT NULL").HasDatabaseName("UX_StoredFiles_User_ClientUploadId");
        b.HasIndex(x => new { x.UploadedByUserId, x.CreatedAt }).HasDatabaseName("IX_StoredFiles_User_CreatedAt");
        b.HasIndex(x => new { x.Status, x.CreatedAt }).HasDatabaseName("IX_StoredFiles_Status_CreatedAt");
    }
}
