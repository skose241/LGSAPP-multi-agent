using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Files;

public interface IFileCleanupService
{
    Task<FileCleanupResult> RunAsync(CancellationToken cancellationToken = default);
}

public sealed class FileCleanupService(
    AppDbContext db,
    IBlobStore blobs,
    TurkeyTime clock,
    IServiceProvider services,
    IOptions<UploadOptions> options,
    ILogger<FileCleanupService> logger) : IFileCleanupService
{
    public const string LockResource = "LGSApp.FileCleanup";
    private const int MaxBatchesPerRun = 50;

    public async Task<FileCleanupResult> RunAsync(CancellationToken cancellationToken = default)
    {
        var pending = 0;
        var unused = 0;
        await DbSeeder.RunExclusiveAsync(services, LockResource, async () =>
        {
            pending = await CleanPendingAsync(cancellationToken);
            unused = await CleanUnusedAsync(cancellationToken);
        }, cancellationToken);
        return new FileCleanupResult(pending, unused);
    }

    private async Task<int> CleanPendingAsync(CancellationToken cancellationToken)
    {
        var o = options.Value;
        var cutoff = clock.UtcNow.AddMinutes(-o.PendingTimeoutMinutes);
        var total = 0;
        for (var batch = 0; batch < MaxBatchesPerRun; batch++)
        {
            var rows = await db.StoredFiles.AsNoTracking()
                .Where(f => f.Status == FileStatus.Pending && f.CreatedAt < cutoff)
                .OrderBy(f => f.Id)
                .Select(f => new { f.Id, f.BlobName })
                .Take(o.CleanupBatchSize)
                .ToListAsync(cancellationToken);
            if (rows.Count == 0)
            {
                break;
            }

            foreach (var row in rows)
            {
                var id = row.Id;
                var now = clock.UtcNow;
                var updated = await db.StoredFiles
                    .Where(f => f.Id == id && f.Status == FileStatus.Pending)
                    .ExecuteUpdateAsync(
                        s => s.SetProperty(f => f.Status, FileStatus.Deleted)
                            .SetProperty(f => f.DeletedAt, now)
                            .SetProperty(f => f.ClientUploadId, (Guid?)null),
                        cancellationToken);
                if (updated > 0)
                {
                    await DeleteBlobAsync(row.BlobName);
                    total++;
                }
            }

            if (rows.Count < o.CleanupBatchSize)
            {
                break;
            }
        }

        return total;
    }

    private async Task<int> CleanUnusedAsync(CancellationToken cancellationToken)
    {
        var o = options.Value;
        var cutoff = clock.UtcNow.AddDays(-o.UnusedRetentionDays);
        var total = 0;
        for (var batch = 0; batch < MaxBatchesPerRun; batch++)
        {
            var rows = await db.StoredFiles.AsNoTracking()
                .Where(f => f.Status == FileStatus.Ready
                    && f.CreatedAt < cutoff
                    && !db.Questions.Any(q => q.ImageFileId == f.Id)
                    && !db.Solutions.Any(s => s.ImageFileId == f.Id))
                .OrderBy(f => f.Id)
                .Select(f => new { f.Id, f.BlobName })
                .Take(o.CleanupBatchSize)
                .ToListAsync(cancellationToken);
            if (rows.Count == 0)
            {
                break;
            }

            var changed = 0;
            foreach (var row in rows)
            {
                var id = row.Id;
                var now = clock.UtcNow;
                var updated = await db.StoredFiles
                    .Where(f => f.Id == id
                        && f.Status == FileStatus.Ready
                        && !db.Questions.Any(q => q.ImageFileId == f.Id)
                        && !db.Solutions.Any(s => s.ImageFileId == f.Id))
                    .ExecuteUpdateAsync(
                        s => s.SetProperty(f => f.Status, FileStatus.Deleted)
                            .SetProperty(f => f.DeletedAt, now)
                            .SetProperty(f => f.ClientUploadId, (Guid?)null),
                        cancellationToken);
                if (updated > 0)
                {
                    await DeleteBlobAsync(row.BlobName);
                    changed++;
                }
            }

            total += changed;
            if (rows.Count < o.CleanupBatchSize || changed == 0)
            {
                break;
            }
        }

        return total;
    }

    private async Task DeleteBlobAsync(string blobName)
    {
        try
        {
            await blobs.DeleteIfExistsAsync(blobName, CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Temizlikte blob nesnesi kaldırılamadı: {BlobName}", blobName);
        }
    }
}

public sealed class FileCleanupWorker(IServiceScopeFactory scopes, IOptions<UploadOptions> options, ILogger<FileCleanupWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.CleanupEnabled)
        {
            return;
        }

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(Math.Max(1, options.Value.CleanupIntervalMinutes)));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    var cleanup = scope.ServiceProvider.GetRequiredService<IFileCleanupService>();
                    var result = await cleanup.RunAsync(stoppingToken);
                    if (result.PendingDeleted + result.UnusedDeleted > 0)
                    {
                        logger.LogInformation("Dosya temizliği tamamlandı. Bekleyen: {Pending}, kullanılmayan: {Unused}", result.PendingDeleted, result.UnusedDeleted);
                    }

                    var released = await scope.ServiceProvider.GetRequiredService<Ai.IAiPendingCleanupService>().RunAsync(stoppingToken);
                    if (released > 0)
                    {
                        logger.LogInformation("Yetim yapay zekâ rezervasyonu iade edildi: {Count}", released);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Dosya temizliği başarısız oldu.");
                }
            }
        }
        catch (OperationCanceledException)
        {
        }
    }
}
