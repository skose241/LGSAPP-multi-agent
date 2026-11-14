using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.Extensions.Options;
using SkiaSharp;

namespace LGSApp.Infrastructure.Services.Files;

public sealed class SkiaImageProcessor : IImageProcessor, IDisposable
{
    public const string HeicMessage = "HEIC biçimi desteklenmiyor. Uygulamayı güncelleyin veya fotoğrafı JPEG olarak kaydedin.";
    public const string EmptyMessage = "Dosya boş.";
    public const string UnsupportedMessage = "Yalnızca JPEG, PNG veya WebP fotoğraflar yüklenebilir.";
    public const string CorruptMessage = "Fotoğraf okunamadı veya bozuk.";
    public const string AnimatedMessage = "Hareketli görseller desteklenmiyor.";

    private static readonly string[] HeicBrands = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];
    private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    private readonly UploadOptions options;
    private readonly SemaphoreSlim gate;

    public SkiaImageProcessor(IOptions<UploadOptions> options)
    {
        this.options = options.Value;
        gate = new SemaphoreSlim(Math.Max(1, this.options.MaxConcurrentProcessing));
    }

    public void Dispose() => gate.Dispose();

    public static string TooLargeMessage(long maxBytes) =>
        $"Dosya en fazla {maxBytes / (1024 * 1024)} MB olabilir.";

    public async Task<ServiceResult<ProcessedImage>> ProcessAsync(Stream input, CancellationToken cancellationToken = default)
    {
        await using var buffer = new MemoryStream();
        var limit = options.MaxBytes + 1;
        var chunk = new byte[81920];
        while (buffer.Length < limit)
        {
            var wanted = (int)Math.Min(chunk.Length, limit - buffer.Length);
            var read = await input.ReadAsync(chunk.AsMemory(0, wanted), cancellationToken);
            if (read == 0)
            {
                break;
            }

            buffer.Write(chunk, 0, read);
        }

        if (buffer.Length > options.MaxBytes)
        {
            return Fail.PayloadTooLarge(TooLargeMessage(options.MaxBytes));
        }

        if (buffer.Length == 0)
        {
            return FileErrors.Invalid(EmptyMessage);
        }

        var head = new byte[Math.Min(32, (int)buffer.Length)];
        buffer.Position = 0;
        buffer.ReadExactly(head);
        var kind = Sniff(head);
        if (kind == SniffResult.Heic)
        {
            return FileErrors.Invalid(HeicMessage);
        }

        if (kind == SniffResult.Unsupported)
        {
            return FileErrors.Invalid(UnsupportedMessage);
        }

        await gate.WaitAsync(cancellationToken);
        try
        {
            return await DecodeAndEncodeAsync(buffer, cancellationToken);
        }
        finally
        {
            gate.Release();
        }
    }

    public byte[] ResizeForAi(byte[] source, int maxEdge, int quality)
    {
        ArgumentNullException.ThrowIfNull(source);
        if (source.Length == 0)
        {
            throw new InvalidDataException(EmptyMessage);
        }

        var kind = Sniff(source.AsSpan(0, Math.Min(32, source.Length)));
        if (kind is SniffResult.Unsupported or SniffResult.Heic)
        {
            throw new InvalidDataException(UnsupportedMessage);
        }

        gate.Wait();
        try
        {
            var result = Encode(source, source.Length, Math.Clamp(maxEdge, 64, 8000), Math.Clamp(quality, 30, 100), false);
            if (!result.Succeeded)
            {
                throw new InvalidDataException(result.Message ?? CorruptMessage);
            }

            return result.Value!.Bytes;
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<ServiceResult<ProcessedImage>> DecodeAndEncodeAsync(MemoryStream buffer, CancellationToken cancellationToken)
    {
        try
        {
            var bytes = buffer.GetBuffer();
            var length = (int)buffer.Length;
            return await Task.Run(() => Encode(bytes, length, options.MaxEdge, options.JpegQuality, true), cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return FileErrors.Invalid(CorruptMessage);
        }
    }

    private ServiceResult<ProcessedImage> Encode(byte[] bytes, int length, int maxEdge, int jpegQuality, bool enforceUploadLimits)
    {
        using var data = SKData.CreateCopy(bytes.AsSpan(0, length));
        using var codec = SKCodec.Create(data);
        if (codec is null)
        {
            return FileErrors.Invalid(CorruptMessage);
        }

        var info = codec.Info;
        if (info.Width <= 0 || info.Height <= 0)
        {
            return FileErrors.Invalid(CorruptMessage);
        }

        if (codec.FrameCount > 1)
        {
            return FileErrors.Invalid(AnimatedMessage);
        }

        if (enforceUploadLimits && Math.Min(info.Width, info.Height) < options.MinEdge)
        {
            return FileErrors.Invalid($"Fotoğrafın kısa kenarı en az {options.MinEdge} piksel olmalıdır.");
        }

        if ((long)info.Width * info.Height > options.MaxPixels)
        {
            return FileErrors.Invalid($"Fotoğraf çok büyük (en fazla {options.MaxPixels / 1_000_000} megapiksel).");
        }

        var origin = codec.EncodedOrigin;
        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var orientedWidth = swap ? info.Height : info.Width;
        var orientedHeight = swap ? info.Width : info.Height;

        var longEdge = Math.Max(orientedWidth, orientedHeight);
        var targetWidth = orientedWidth;
        var targetHeight = orientedHeight;
        if (longEdge > maxEdge)
        {
            var ratio = (double)maxEdge / longEdge;
            targetWidth = Math.Max(1, (int)Math.Round(orientedWidth * ratio));
            targetHeight = Math.Max(1, (int)Math.Round(orientedHeight * ratio));
        }

        if (enforceUploadLimits && Math.Min(targetWidth, targetHeight) < options.MinEdge)
        {
            return FileErrors.Invalid($"Fotoğrafın kısa kenarı en az {options.MinEdge} piksel olmalıdır.");
        }

        var decodeWidth = info.Width;
        var decodeHeight = info.Height;
        if (longEdge > maxEdge)
        {
            var scaled = codec.GetScaledDimensions((float)targetWidth / orientedWidth);
            if (scaled.Width > 0 && scaled.Height > 0 && scaled.Width <= info.Width && scaled.Height <= info.Height)
            {
                var scaledLong = Math.Max(scaled.Width, scaled.Height);
                if (scaledLong >= maxEdge)
                {
                    decodeWidth = scaled.Width;
                    decodeHeight = scaled.Height;
                }
            }
        }

        var decodeInfo = new SKImageInfo(decodeWidth, decodeHeight, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var source = new SKBitmap();
        if (!source.TryAllocPixels(decodeInfo))
        {
            return FileErrors.Invalid(CorruptMessage);
        }

        var decodeResult = codec.GetPixels(decodeInfo, source.GetPixels());
        if (decodeResult != SKCodecResult.Success)
        {
            return FileErrors.Invalid(CorruptMessage);
        }

        source.SetImmutable();
        using var sourceImage = SKImage.FromBitmap(source);

        var outputInfo = new SKImageInfo(targetWidth, targetHeight, SKColorType.Rgba8888, SKAlphaType.Opaque);
        using var target = new SKBitmap();
        if (!target.TryAllocPixels(outputInfo))
        {
            return FileErrors.Invalid(CorruptMessage);
        }

        using (var canvas = new SKCanvas(target))
        {
            canvas.Clear(SKColors.White);
            var orientedDecodeWidth = swap ? decodeHeight : decodeWidth;
            var orientedDecodeHeight = swap ? decodeWidth : decodeHeight;
            canvas.Scale((float)targetWidth / orientedDecodeWidth, (float)targetHeight / orientedDecodeHeight);
            canvas.Concat(OrientationMatrix(origin, decodeWidth, decodeHeight));
            using var paint = new SKPaint { IsAntialias = true };
            canvas.DrawImage(sourceImage, 0, 0, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear), paint);
        }

        using var outputImage = SKImage.FromBitmap(target);
        using var encoded = outputImage.Encode(SKEncodedImageFormat.Jpeg, jpegQuality);
        if (encoded is null)
        {
            return FileErrors.Invalid(CorruptMessage);
        }

        return ServiceResult<ProcessedImage>.Ok(new ProcessedImage(encoded.ToArray(), targetWidth, targetHeight));
    }

    private static SKMatrix OrientationMatrix(SKEncodedOrigin origin, int width, int height) => origin switch
    {
        SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, width, 0, 1, 0, 0, 0, 1),
        SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, width, 0, -1, height, 0, 0, 1),
        SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, height, 0, 0, 1),
        SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
        SKEncodedOrigin.RightTop => new SKMatrix(0, -1, height, 1, 0, 0, 0, 0, 1),
        SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, height, -1, 0, width, 0, 0, 1),
        SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, width, 0, 0, 1),
        _ => SKMatrix.Identity
    };

    private enum SniffResult
    {
        Unsupported,
        Jpeg,
        Png,
        Webp,
        Heic
    }

    private static SniffResult Sniff(ReadOnlySpan<byte> head)
    {
        if (head.Length >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF)
        {
            return SniffResult.Jpeg;
        }

        if (head.Length >= 8 && head[..8].SequenceEqual(PngSignature))
        {
            return SniffResult.Png;
        }

        if (head.Length >= 12 && head[..4].SequenceEqual("RIFF"u8) && head[8..12].SequenceEqual("WEBP"u8))
        {
            return SniffResult.Webp;
        }

        if (head.Length >= 12 && head[4..8].SequenceEqual("ftyp"u8))
        {
            var brand = System.Text.Encoding.ASCII.GetString(head[8..12]);
            if (HeicBrands.Contains(brand, StringComparer.Ordinal))
            {
                return SniffResult.Heic;
            }
        }

        return SniffResult.Unsupported;
    }
}
