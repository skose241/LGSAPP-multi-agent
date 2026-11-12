using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Files;

public interface IFileUrlService
{
    Task<IReadOnlyDictionary<int, ImageView>> GetAsync(IEnumerable<int?> fileIds, CancellationToken cancellationToken = default);
}

public static class FileUrlServiceExtensions
{
    public static ImageView? Find(this IReadOnlyDictionary<int, ImageView> map, int? fileId) =>
        fileId is int id && map.TryGetValue(id, out var image) ? image : null;

    public static async Task<ImageView?> GetOneAsync(this IFileUrlService service, int? fileId, CancellationToken cancellationToken = default)
    {
        if (fileId is null)
        {
            return null;
        }

        var map = await service.GetAsync([fileId], cancellationToken);
        return map.GetValueOrDefault(fileId.Value);
    }
}

public sealed class FileUrlService(AppDbContext db, IBlobStore blobs, TurkeyTime clock) : IFileUrlService
{
    public async Task<IReadOnlyDictionary<int, ImageView>> GetAsync(IEnumerable<int?> fileIds, CancellationToken cancellationToken = default)
    {
        var ids = fileIds.Where(i => i is not null).Select(i => i!.Value).Distinct().ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<int, ImageView>();
        }

        var rows = await db.StoredFiles.AsNoTracking()
            .Where(f => ids.Contains(f.Id) && f.Status == FileStatus.Ready && f.Width != null && f.Height != null)
            .Select(f => new { f.Id, f.BlobName, Width = f.Width!.Value, Height = f.Height!.Value })
            .ToListAsync(cancellationToken);

        var now = new DateTimeOffset(clock.UtcNow, TimeSpan.Zero);
        var result = new Dictionary<int, ImageView>(rows.Count);
        foreach (var row in rows)
        {
            var uri = blobs.GetReadUri(row.BlobName, now);
            result[row.Id] = new ImageView(row.Id, uri.Url, row.Width, row.Height, uri.ExpiresAt);
        }

        return result;
    }
}
