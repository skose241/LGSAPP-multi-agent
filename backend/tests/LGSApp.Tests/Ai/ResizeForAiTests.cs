using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Files;
using SkiaSharp;

namespace LGSApp.Tests.Ai;

public class ResizeForAiTests
{
    private static SkiaImageProcessor Create() =>
        new(Microsoft.Extensions.Options.Options.Create(new UploadOptions()));

    private static byte[] Encode(int width, int height, SKEncodedImageFormat format)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(SKColors.CornflowerBlue);
            using var paint = new SKPaint { Color = SKColors.Black };
            canvas.DrawRect(10, 10, width / 2f, height / 2f, paint);
        }

        using var image = SKImage.FromBitmap(bitmap);
        return image.Encode(format, 95).ToArray();
    }

    private static (int Width, int Height) Size(byte[] bytes)
    {
        using var codec = SKCodec.Create(SKData.CreateCopy(bytes));
        return (codec.Info.Width, codec.Info.Height);
    }

    [Theory]
    [InlineData(3000, 2000, 1536, 1024)]
    [InlineData(2000, 3000, 1024, 1536)]
    [InlineData(1536, 1000, 1536, 1000)]
    public void Long_edge_is_limited_without_upscaling(int width, int height, int expectedWidth, int expectedHeight)
    {
        using var processor = Create();

        var result = processor.ResizeForAi(Encode(width, height, SKEncodedImageFormat.Jpeg), 1536, 80);

        Assert.Equal(new byte[] { 0xFF, 0xD8, 0xFF }, result.Take(3));
        Assert.Equal((expectedWidth, expectedHeight), Size(result));
    }

    [Fact]
    public void Small_images_are_accepted_and_png_is_reencoded_as_jpeg()
    {
        using var processor = Create();

        var result = processor.ResizeForAi(Encode(120, 90, SKEncodedImageFormat.Png), 1536, 80);

        Assert.Equal(new byte[] { 0xFF, 0xD8, 0xFF }, result.Take(3));
        Assert.Equal((120, 90), Size(result));
    }

    [Fact]
    public void Lower_quality_gives_smaller_output()
    {
        using var processor = Create();
        var source = Encode(1800, 1200, SKEncodedImageFormat.Jpeg);

        Assert.True(processor.ResizeForAi(source, 1536, 40).Length < processor.ResizeForAi(source, 1536, 95).Length);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(40)]
    public void Invalid_data_throws_invalid_data_exception(int length)
    {
        using var processor = Create();
        var bytes = new byte[length];
        if (length > 3)
        {
            bytes[0] = 0xFF;
            bytes[1] = 0xD8;
            bytes[2] = 0xFF;
        }

        Assert.Throws<InvalidDataException>(() => processor.ResizeForAi(bytes, 1536, 80));
    }
}
