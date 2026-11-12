using LGSApp.Domain.Entities;

namespace LGSApp.Infrastructure.Services.Files;

public sealed record ImageView(int FileId, string Url, int Width, int Height, DateTimeOffset ExpiresAt);

public sealed record FileView(
    int Id,
    FilePurpose Purpose,
    string ContentType,
    long SizeBytes,
    int Width,
    int Height,
    string Url,
    DateTimeOffset UrlExpiresAt);

public sealed record FileUploadOutcome(FileView File, bool Created);

public sealed record FileCleanupResult(int PendingDeleted, int UnusedDeleted);
