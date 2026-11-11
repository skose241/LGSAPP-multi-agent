namespace LGSApp.Domain.Entities;

public class StoredFile
{
    public int Id { get; set; }
    public string Container { get; set; } = string.Empty;
    public string BlobName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public FilePurpose Purpose { get; set; }
    public FileStatus Status { get; set; } = FileStatus.Pending;
    public int UploadedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ConfirmedAt { get; set; }
}
