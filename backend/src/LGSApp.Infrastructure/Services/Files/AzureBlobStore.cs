using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;
using LGSApp.Infrastructure.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Files;

public sealed class AzureBlobStore : IBlobStore
{
    private readonly BlobContainerClient container;
    private readonly StorageOptions options;
    private readonly Uri? publicEndpoint;

    public AzureBlobStore(IOptions<StorageOptions> options)
    {
        this.options = options.Value;
        container = new BlobContainerClient(this.options.ConnectionString, this.options.Container);
        publicEndpoint = string.IsNullOrWhiteSpace(this.options.PublicEndpoint) ? null : new Uri(this.options.PublicEndpoint, UriKind.Absolute);
    }

    public string ContainerName => options.Container;

    public BlobContainerClient Container => container;

    public async Task UploadAsync(string blobName, Stream content, string contentType, string cacheControl, CancellationToken cancellationToken = default)
    {
        var blob = container.GetBlobClient(blobName);
        await blob.UploadAsync(
            content,
            new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders { ContentType = contentType, CacheControl = cacheControl },
                Conditions = new BlobRequestConditions { IfNoneMatch = ETag.All }
            },
            cancellationToken);
    }

    public async Task DeleteIfExistsAsync(string blobName, CancellationToken cancellationToken = default)
    {
        await container.GetBlobClient(blobName).DeleteIfExistsAsync(DeleteSnapshotsOption.IncludeSnapshots, cancellationToken: cancellationToken);
    }

    public async Task<byte[]> DownloadAsync(string blobName, long maxBytes, CancellationToken cancellationToken = default)
    {
        var blob = container.GetBlobClient(blobName);
        try
        {
            var properties = await blob.GetPropertiesAsync(cancellationToken: cancellationToken);
            var length = properties.Value.ContentLength;
            if (length > maxBytes)
            {
                throw new InvalidDataException($"Dosya izin verilen boyutu aşıyor ({length} bayt).");
            }

            using var buffer = new MemoryStream((int)length);
            await blob.DownloadToAsync(buffer, cancellationToken);
            if (buffer.Length > maxBytes)
            {
                throw new InvalidDataException($"Dosya izin verilen boyutu aşıyor ({buffer.Length} bayt).");
            }

            return buffer.ToArray();
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            throw new FileNotFoundException("Depolamada dosya bulunamadı.", blobName, ex);
        }
    }

    public BlobReadUri GetReadUri(string blobName, DateTimeOffset now)
    {
        var bucket = TimeSpan.FromMinutes(Math.Max(1, options.ReadSasBucketMinutes));
        var utc = now.ToUniversalTime();
        var aligned = new DateTimeOffset(utc.Ticks - utc.Ticks % bucket.Ticks, TimeSpan.Zero);
        var starts = aligned.AddMinutes(-5);
        var expires = starts.AddMinutes(options.ReadSasMinutes);

        var blob = container.GetBlobClient(blobName);
        var builder = new BlobSasBuilder(BlobSasPermissions.Read, expires)
        {
            BlobContainerName = container.Name,
            BlobName = blobName,
            Resource = "b",
            StartsOn = starts,
            Protocol = blob.Uri.Scheme == Uri.UriSchemeHttps ? SasProtocol.Https : SasProtocol.HttpsAndHttp
        };

        var uri = blob.GenerateSasUri(builder);
        if (publicEndpoint is not null)
        {
            var rewritten = new UriBuilder(uri)
            {
                Scheme = publicEndpoint.Scheme,
                Host = publicEndpoint.Host,
                Port = publicEndpoint.IsDefaultPort ? -1 : publicEndpoint.Port
            };
            uri = rewritten.Uri;
        }

        return new BlobReadUri(uri.AbsoluteUri, expires);
    }
}

public sealed class BlobContainerInitializer(AzureBlobStore store, IOptions<StorageOptions> options, ILogger<BlobContainerInitializer> logger) : Microsoft.Extensions.Hosting.IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!options.Value.CreateContainerIfMissing)
        {
            return;
        }

        try
        {
            await store.Container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: cancellationToken);
        }
        catch (Exception ex) when (ex is RequestFailedException or AggregateException or HttpRequestException)
        {
            logger.LogError(ex, "Depolama kabı oluşturulamadı veya doğrulanamadı.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
