namespace LGSApp.Infrastructure.Services.Files;

public interface IBlobStore
{
    Task UploadAsync(string blobName, Stream content, string contentType, string cacheControl, CancellationToken cancellationToken = default);
    Task DeleteIfExistsAsync(string blobName, CancellationToken cancellationToken = default);
    BlobReadUri GetReadUri(string blobName, DateTimeOffset now);
    string ContainerName { get; }
}

public sealed record BlobReadUri(string Url, DateTimeOffset ExpiresAt);
