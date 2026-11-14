using LGSApp.Infrastructure.Services.Common;

namespace LGSApp.Infrastructure.Services.Files;

public sealed record ProcessedImage(byte[] Bytes, int Width, int Height);

public static class ThumbnailSizing
{
    public static (int Width, int Height)? Compute(int width, int height, int maxEdge)
    {
        if (width <= 0 || height <= 0 || maxEdge <= 0)
        {
            return null;
        }

        var longEdge = Math.Max(width, height);
        if (longEdge <= maxEdge)
        {
            return null;
        }

        var ratio = (double)maxEdge / longEdge;
        return (Math.Max(1, (int)Math.Round(width * ratio)), Math.Max(1, (int)Math.Round(height * ratio)));
    }

    public static string BlobName(string blobName) => "thumbs/" + blobName;
}

public interface IImageProcessor
{
    Task<ServiceResult<ProcessedImage>> ProcessAsync(Stream input, CancellationToken cancellationToken = default);
    byte[] ResizeForAi(byte[] source, int maxEdge, int quality);
    Task<ProcessedImage?> CreateThumbnailAsync(byte[] processedJpeg, CancellationToken cancellationToken = default);
}

public static class FileErrors
{
    public const string FileKey = "file";

    public static Failure Invalid(string message) =>
        Fail.Validation(message, new Dictionary<string, string[]> { [FileKey] = [message] });
}
