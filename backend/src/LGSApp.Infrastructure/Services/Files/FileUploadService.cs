using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LGSApp.Infrastructure.Services.Files;

public interface IFileUploadService
{
    Task<ServiceResult<FileUploadOutcome>> UploadAsync(Actor actor, FilePurpose purpose, Guid clientUploadId, Stream content, CancellationToken cancellationToken = default);
    Task<ServiceResult<FileView>> GetAsync(Actor actor, int fileId, CancellationToken cancellationToken = default);
    Task<ServiceResult> DeleteAsync(Actor actor, int fileId, CancellationToken cancellationToken = default);
}

public sealed class FileUploadService(
    AppDbContext db,
    IBlobStore blobs,
    IImageProcessor processor,
    IFileUrlService urls,
    ISettingsService settings,
    TurkeyTime clock,
    ILogger<FileUploadService> logger) : IFileUploadService
{
    public const string DailyLimitMessage = "Günlük yükleme sınırına ulaştınız.";
    public const string StillProcessingMessage = "Bu yükleme hâlâ işleniyor.";
    public const string UnsupportedPurposeMessage = "Bu dosya türü henüz desteklenmiyor.";
    public const string InUseMessage = "Fotoğraf kullanımda.";
    public const string CacheControl = "private, max-age=86400, immutable";
    public const string StoredContentType = "image/jpeg";

    public async Task<ServiceResult<FileUploadOutcome>> UploadAsync(Actor actor, FilePurpose purpose, Guid clientUploadId, Stream content, CancellationToken cancellationToken = default)
    {
        if (!actor.IsMudur && !actor.IsTeacher && !actor.IsStudent)
        {
            return Fail.Forbidden("Bu işlem için yetkiniz yok.");
        }

        var prefix = purpose switch
        {
            FilePurpose.QuestionImage => "q",
            FilePurpose.SolutionImage => "s",
            FilePurpose.AssignmentImage => "a",
            _ => null
        };
        if (prefix is null)
        {
            return Fail.Validation(UnsupportedPurposeMessage, new Dictionary<string, string[]> { ["purpose"] = [UnsupportedPurposeMessage] });
        }

        if (purpose == FilePurpose.AssignmentImage && !actor.IsModerator)
        {
            return Fail.Forbidden("Ödev görseli yalnızca öğretmen veya müdür tarafından yüklenebilir.");
        }

        if (clientUploadId == Guid.Empty)
        {
            return Fail.Validation("Yükleme kimliği zorunludur.", new Dictionary<string, string[]> { ["clientUploadId"] = ["Yükleme kimliği zorunludur."] });
        }

        var userId = actor.UserId;
        var existing = await db.StoredFiles
            .FirstOrDefaultAsync(f => f.UploadedByUserId == userId && f.ClientUploadId == clientUploadId, cancellationToken);
        if (existing is not null)
        {
            if (existing.Status == FileStatus.Deleted)
            {
                existing.ClientUploadId = null;
                await db.SaveChangesAsync(cancellationToken);
            }
            else if (existing.Purpose != purpose)
            {
                return Fail.Conflict("Bu yükleme kimliği başka bir amaçla kullanılmış.");
            }
            else if (existing.Status == FileStatus.Pending)
            {
                return Fail.Conflict(StillProcessingMessage);
            }
            else
            {
                var view = await ToViewAsync(existing, cancellationToken);
                return view is null ? Fail.Conflict(StillProcessingMessage) : ServiceResult<FileUploadOutcome>.Ok(new FileUploadOutcome(view, false));
            }
        }

        var limit = await settings.GetIntAsync(actor.IsStudent ? SettingKeys.GunlukDosyaLimitiOgrenci : SettingKeys.GunlukDosyaLimitiOgretmen, cancellationToken);
        var dayStart = TurkeyTime.ToUtc(clock.Today, TimeOnly.MinValue);
        var usedToday = await db.StoredFiles.AsNoTracking().CountAsync(f => f.UploadedByUserId == userId && f.CreatedAt >= dayStart, cancellationToken);
        if (usedToday >= limit)
        {
            return Fail.TooManyRequests(DailyLimitMessage);
        }

        var processed = await processor.ProcessAsync(content, cancellationToken);
        if (!processed.Succeeded)
        {
            return ServiceResult<FileUploadOutcome>.From(processed);
        }

        var image = processed.Value!;
        var thumbnail = await TryCreateThumbnailAsync(image, cancellationToken);
        var now = clock.UtcNow;
        var blobName = $"{prefix}/{now:yyyy}/{now:MM}/{Guid.NewGuid():N}.jpg";
        var thumbnailBlobName = thumbnail is null ? null : ThumbnailSizing.BlobName(blobName);
        var file = new StoredFile
        {
            Container = blobs.ContainerName,
            BlobName = blobName,
            ThumbnailBlobName = thumbnailBlobName,
            ThumbnailWidth = thumbnail?.Width,
            ThumbnailHeight = thumbnail?.Height,
            ThumbnailSizeBytes = thumbnail?.Bytes.Length,
            ContentType = StoredContentType,
            SizeBytes = image.Bytes.Length,
            Purpose = purpose,
            Status = FileStatus.Pending,
            UploadedByUserId = userId,
            ClientUploadId = clientUploadId,
            CreatedAt = now
        };
        db.StoredFiles.Add(file);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation())
        {
            db.Entry(file).State = EntityState.Detached;
            return Fail.Conflict(StillProcessingMessage);
        }

        try
        {
            await using var stream = new MemoryStream(image.Bytes, writable: false);
            await blobs.UploadAsync(file.BlobName, stream, StoredContentType, CacheControl, cancellationToken);

            if (thumbnail is not null && thumbnailBlobName is not null && !await TryUploadThumbnailAsync(thumbnailBlobName, thumbnail, cancellationToken))
            {
                file.ThumbnailBlobName = null;
                file.ThumbnailWidth = null;
                file.ThumbnailHeight = null;
                file.ThumbnailSizeBytes = null;
            }

            file.Width = image.Width;
            file.Height = image.Height;
            file.Status = FileStatus.Ready;
            file.ConfirmedAt = clock.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            await AbandonAsync(file, thumbnailBlobName);
            throw;
        }

        var created = await ToViewAsync(file, cancellationToken);
        return created is null
            ? Fail.Conflict(StillProcessingMessage)
            : ServiceResult<FileUploadOutcome>.Ok(new FileUploadOutcome(created, true));
    }

    public async Task<ServiceResult<FileView>> GetAsync(Actor actor, int fileId, CancellationToken cancellationToken = default)
    {
        var file = await db.StoredFiles.AsNoTracking().FirstOrDefaultAsync(f => f.Id == fileId, cancellationToken);
        if (file is null || file.Status != FileStatus.Ready || (file.UploadedByUserId != actor.UserId && !actor.IsModerator))
        {
            return Fail.NotFound("Dosya bulunamadı.");
        }

        var view = await ToViewAsync(file, cancellationToken);
        return view is null ? Fail.NotFound("Dosya bulunamadı.") : ServiceResult<FileView>.Ok(view);
    }

    public async Task<ServiceResult> DeleteAsync(Actor actor, int fileId, CancellationToken cancellationToken = default)
    {
        string? blobName = null;
        string? thumbnailName = null;
        var result = await db.ExecuteInTransactionAsync<ServiceResult>(async token =>
        {
            var file = await db.StoredFiles
                .FromSqlInterpolated($"SELECT * FROM [StoredFiles] WITH (UPDLOCK, ROWLOCK) WHERE [Id] = {fileId}")
                .FirstOrDefaultAsync(token);
            if (file is null || file.Status == FileStatus.Deleted || file.UploadedByUserId != actor.UserId)
            {
                return Fail.NotFound("Dosya bulunamadı.");
            }

            var inUse = await db.Questions.AnyAsync(q => q.ImageFileId == fileId, token)
                || await db.Solutions.AnyAsync(s => s.ImageFileId == fileId, token);
            if (inUse)
            {
                return Fail.Conflict(InUseMessage);
            }

            file.Status = FileStatus.Deleted;
            file.DeletedAt = clock.UtcNow;
            file.ClientUploadId = null;
            await db.SaveChangesAsync(token);
            blobName = file.BlobName;
            thumbnailName = file.ThumbnailBlobName;
            return ServiceResult.Ok();
        }, cancellationToken);

        if (result.Succeeded && blobName is not null)
        {
            try
            {
                await blobs.DeleteIfExistsAsync(blobName, CancellationToken.None);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Silinen dosyanın blob nesnesi kaldırılamadı: {BlobName}", blobName);
            }

            if (thumbnailName is not null)
            {
                try
                {
                    await blobs.DeleteIfExistsAsync(thumbnailName, CancellationToken.None);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Silinen dosyanın küçük resmi kaldırılamadı: {BlobName}", thumbnailName);
                }
            }
        }

        return result;
    }

    private async Task<FileView?> ToViewAsync(StoredFile file, CancellationToken cancellationToken)
    {
        var map = await urls.GetAsync([file.Id], cancellationToken);
        if (!map.TryGetValue(file.Id, out var image))
        {
            return null;
        }

        return new FileView(file.Id, file.Purpose, file.ContentType, file.SizeBytes, image.Width, image.Height, image.Url, image.ExpiresAt, image.ThumbnailUrl, image.ThumbnailWidth, image.ThumbnailHeight);
    }

    private async Task<ProcessedImage?> TryCreateThumbnailAsync(ProcessedImage image, CancellationToken cancellationToken)
    {
        try
        {
            return await processor.CreateThumbnailAsync(image.Bytes, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Küçük resim üretilemedi; yükleme küçük resimsiz sürdürülüyor.");
            return null;
        }
    }

    private async Task<bool> TryUploadThumbnailAsync(string thumbnailBlobName, ProcessedImage thumbnail, CancellationToken cancellationToken)
    {
        try
        {
            await using var stream = new MemoryStream(thumbnail.Bytes, writable: false);
            await blobs.UploadAsync(thumbnailBlobName, stream, StoredContentType, CacheControl, cancellationToken);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Küçük resim yüklenemedi; yükleme küçük resimsiz sürdürülüyor: {BlobName}", thumbnailBlobName);
            try
            {
                await blobs.DeleteIfExistsAsync(thumbnailBlobName, CancellationToken.None);
            }
            catch (Exception cleanup)
            {
                logger.LogWarning(cleanup, "Yarım kalan küçük resim kaldırılamadı: {BlobName}", thumbnailBlobName);
            }

            return false;
        }
    }

    private async Task AbandonAsync(StoredFile file, string? thumbnailBlobName)
    {
        if (thumbnailBlobName is not null)
        {
            try
            {
                await blobs.DeleteIfExistsAsync(thumbnailBlobName, CancellationToken.None);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Yarım kalan yüklemenin küçük resmi kaldırılamadı: {BlobName}", thumbnailBlobName);
            }
        }

        try
        {
            await blobs.DeleteIfExistsAsync(file.BlobName, CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Yarım kalan yüklemenin blob nesnesi kaldırılamadı: {BlobName}", file.BlobName);
        }

        try
        {
            db.ChangeTracker.Clear();
            await db.StoredFiles
                .Where(f => f.Id == file.Id && f.Status != FileStatus.Ready)
                .ExecuteUpdateAsync(
                    s => s.SetProperty(f => f.Status, FileStatus.Deleted)
                        .SetProperty(f => f.DeletedAt, clock.UtcNow)
                        .SetProperty(f => f.ClientUploadId, (Guid?)null),
                    CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Yarım kalan yükleme kaydı işaretlenemedi: {FileId}", file.Id);
        }
    }
}
