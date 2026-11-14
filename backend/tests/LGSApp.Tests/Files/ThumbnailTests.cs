using System.Text;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Files;
using SkiaSharp;

namespace LGSApp.Tests.Files;

public class ThumbnailTests
{
    private static SkiaImageProcessor Create(UploadOptions? options = null) =>
        new(Microsoft.Extensions.Options.Options.Create(options ?? new UploadOptions()));

    private static byte[] Encode(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(SKColors.White);
            using var paint = new SKPaint { Color = SKColors.DarkRed };
            canvas.DrawRect(20, 20, width / 3f, height / 3f, paint);
        }

        using var image = SKImage.FromBitmap(bitmap);
        return image.Encode(SKEncodedImageFormat.Jpeg, 90).ToArray();
    }

    private static (int Width, int Height) Size(byte[] bytes)
    {
        using var codec = SKCodec.Create(SKData.CreateCopy(bytes));
        return (codec.Info.Width, codec.Info.Height);
    }

    [Theory]
    [InlineData(2000, 1500, 480, 480, 360)]
    [InlineData(1500, 2000, 480, 360, 480)]
    [InlineData(1000, 1000, 480, 480, 480)]
    [InlineData(2000, 200, 480, 480, 48)]
    [InlineData(200, 2000, 480, 48, 480)]
    [InlineData(481, 300, 480, 480, 299)]
    public void Long_edge_is_scaled_to_the_limit_keeping_the_ratio(int width, int height, int edge, int expectedWidth, int expectedHeight)
    {
        Assert.Equal((expectedWidth, expectedHeight), ThumbnailSizing.Compute(width, height, edge));
    }

    [Theory]
    [InlineData(480, 300)]
    [InlineData(480, 480)]
    [InlineData(300, 200)]
    [InlineData(1, 1)]
    public void Images_within_the_limit_get_no_thumbnail(int width, int height)
    {
        Assert.Null(ThumbnailSizing.Compute(width, height, 480));
    }

    [Theory]
    [InlineData(0, 100, 480)]
    [InlineData(100, 0, 480)]
    [InlineData(2000, 1000, 0)]
    public void Invalid_dimensions_give_no_thumbnail(int width, int height, int edge)
    {
        Assert.Null(ThumbnailSizing.Compute(width, height, edge));
    }

    [Fact]
    public void Extreme_aspect_ratios_never_collapse_to_zero()
    {
        var size = ThumbnailSizing.Compute(8000, 10, 480);

        Assert.NotNull(size);
        Assert.True(size.Value.Height >= 1);
    }

    [Fact]
    public void Thumbnail_blob_lives_under_a_separate_prefix()
    {
        Assert.Equal("thumbs/q/2026/11/abc.jpg", ThumbnailSizing.BlobName("q/2026/11/abc.jpg"));
    }

    [Fact]
    public async Task Large_image_gets_a_480_pixel_jpeg_thumbnail_smaller_than_the_original()
    {
        using var processor = Create();
        var original = (await processor.ProcessAsync(new MemoryStream(Encode(3000, 2000)))).Value!;

        var thumbnail = await processor.CreateThumbnailAsync(original.Bytes);

        Assert.NotNull(thumbnail);
        Assert.Equal(new byte[] { 0xFF, 0xD8, 0xFF }, thumbnail.Bytes.Take(3));
        Assert.Equal(480, Math.Max(thumbnail.Width, thumbnail.Height));
        Assert.Equal((thumbnail.Width, thumbnail.Height), Size(thumbnail.Bytes));
        Assert.True(thumbnail.Bytes.Length < original.Bytes.Length);
    }

    [Fact]
    public async Task Portrait_image_is_limited_on_its_height()
    {
        using var processor = Create();
        var original = (await processor.ProcessAsync(new MemoryStream(Encode(1200, 2400)))).Value!;

        var thumbnail = await processor.CreateThumbnailAsync(original.Bytes);

        Assert.NotNull(thumbnail);
        Assert.Equal((240, 480), (thumbnail.Width, thumbnail.Height));
    }

    [Fact]
    public async Task Small_image_gets_no_thumbnail()
    {
        using var processor = Create();
        var original = (await processor.ProcessAsync(new MemoryStream(Encode(400, 300)))).Value!;

        Assert.Null(await processor.CreateThumbnailAsync(original.Bytes));
    }

    [Fact]
    public async Task Thumbnail_carries_no_metadata_segments()
    {
        using var processor = Create();
        var original = (await processor.ProcessAsync(new MemoryStream(Encode(2400, 1800)))).Value!;

        var thumbnail = await processor.CreateThumbnailAsync(original.Bytes);

        var text = Encoding.Latin1.GetString(thumbnail!.Bytes);
        Assert.DoesNotContain("Exif", text);
        Assert.DoesNotContain("ns.adobe.com", text);
    }

    [Fact]
    public async Task Configured_edge_is_used()
    {
        using var small = Create(new UploadOptions { ThumbnailEdge = 240, ThumbnailQuality = 40 });
        using var normal = Create();
        var original = (await normal.ProcessAsync(new MemoryStream(Encode(2000, 1000)))).Value!;

        var low = await small.CreateThumbnailAsync(original.Bytes);
        var standard = await normal.CreateThumbnailAsync(original.Bytes);

        Assert.Equal((240, 120), (low!.Width, low.Height));
        Assert.Equal((480, 240), (standard!.Width, standard.Height));
    }

    [Fact]
    public async Task Same_input_gives_the_same_thumbnail()
    {
        using var processor = Create();
        var original = (await processor.ProcessAsync(new MemoryStream(Encode(2600, 1900)))).Value!;

        var first = await processor.CreateThumbnailAsync(original.Bytes);
        var second = await processor.CreateThumbnailAsync(original.Bytes);

        Assert.Equal((first!.Width, first.Height), (second!.Width, second.Height));
        Assert.Equal(first.Bytes, second.Bytes);
    }

    [Theory]
    [InlineData(63, 75, false)]
    [InlineData(480, 75, true)]
    [InlineData(2001, 75, false)]
    [InlineData(480, 29, false)]
    [InlineData(480, 101, false)]
    public void Thumbnail_options_are_validated(int edge, int quality, bool valid)
    {
        var message = UploadOptions.Validate(new UploadOptions { ThumbnailEdge = edge, ThumbnailQuality = quality });

        Assert.Equal(valid, message is null);
    }
}
