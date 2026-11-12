using LGSApp.Infrastructure.Services.Common;

namespace LGSApp.Infrastructure.Services.Files;

public sealed record ProcessedImage(byte[] Bytes, int Width, int Height);

public interface IImageProcessor
{
    Task<ServiceResult<ProcessedImage>> ProcessAsync(Stream input, CancellationToken cancellationToken = default);
}

public static class FileErrors
{
    public const string FileKey = "file";

    public static Failure Invalid(string message) =>
        Fail.Validation(message, new Dictionary<string, string[]> { [FileKey] = [message] });
}
