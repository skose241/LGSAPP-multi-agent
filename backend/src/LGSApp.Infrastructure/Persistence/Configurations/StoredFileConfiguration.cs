using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class StoredFileConfiguration : IEntityTypeConfiguration<StoredFile>
{
    public void Configure(EntityTypeBuilder<StoredFile> b)
    {
        b.ToTable("StoredFiles");
        b.HasKey(x => x.Id);
        b.Property(x => x.Container).HasMaxLength(63).IsRequired();
        b.Property(x => x.BlobName).HasMaxLength(400).IsRequired();
        b.Property(x => x.ContentType).HasMaxLength(100).IsRequired();
        b.Property(x => x.Purpose).HasConversion<byte>();
        b.Property(x => x.Status).HasConversion<byte>();
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.RestrictToUser<StoredFile>(x => x.UploadedByUserId);
        b.HasIndex(x => x.BlobName).IsUnique().HasDatabaseName("UX_StoredFiles_BlobName");
        b.HasIndex(x => new { x.Status, x.CreatedAt }).HasDatabaseName("IX_StoredFiles_Status_CreatedAt");
    }
}
