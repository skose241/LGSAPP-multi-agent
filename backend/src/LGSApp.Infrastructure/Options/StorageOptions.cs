using Microsoft.Extensions.DependencyInjection;

namespace LGSApp.Infrastructure.Options;

public class StorageOptions
{
    public const string SectionName = "Storage";

    public string ConnectionString { get; set; } = string.Empty;
    public string Container { get; set; } = "images";
    public string? PublicEndpoint { get; set; }
    public int ReadSasMinutes { get; set; } = 90;
    public int ReadSasBucketMinutes { get; set; } = 30;
    public bool CreateContainerIfMissing { get; set; }

    public static string? Validate(StorageOptions o)
    {
        if (string.IsNullOrWhiteSpace(o.ConnectionString))
        {
            return "Storage:ConnectionString tanımlı değil. Geliştirmede 'UseDevelopmentStorage=true' kullanılabilir; üretimde Storage__ConnectionString ortam değişkeni verilmelidir.";
        }

        if (string.IsNullOrWhiteSpace(o.Container) || o.Container.Length is < 3 or > 63)
        {
            return "Storage:Container 3 ile 63 karakter arasında olmalıdır.";
        }

        if (o.ReadSasBucketMinutes is < 1 or > 1440 || o.ReadSasMinutes <= o.ReadSasBucketMinutes + 10 || o.ReadSasMinutes > 1440)
        {
            return "Storage:ReadSasMinutes, ReadSasBucketMinutes değerinden en az 10 dakika büyük ve en fazla 1440 olmalıdır.";
        }

        if (!string.IsNullOrWhiteSpace(o.PublicEndpoint) && !Uri.TryCreate(o.PublicEndpoint, UriKind.Absolute, out _))
        {
            return "Storage:PublicEndpoint geçerli bir mutlak adres olmalıdır.";
        }

        return null;
    }
}

public class UploadOptions
{
    public const string SectionName = "Uploads";

    public long MaxBytes { get; set; } = 10 * 1024 * 1024;
    public long MaxPixels { get; set; } = 50_000_000;
    public int MinEdge { get; set; } = 200;
    public int MaxEdge { get; set; } = 2000;
    public int JpegQuality { get; set; } = 82;
    public int MaxConcurrentProcessing { get; set; } = 2;
    public int PendingTimeoutMinutes { get; set; } = 30;
    public int UnusedRetentionDays { get; set; } = 7;
    public int CleanupIntervalMinutes { get; set; } = 30;
    public int CleanupBatchSize { get; set; } = 100;
    public bool CleanupEnabled { get; set; } = true;

    public static string? Validate(UploadOptions o)
    {
        if (o.MaxBytes is < 1024 or > 50 * 1024 * 1024)
        {
            return "Uploads:MaxBytes 1 KB ile 50 MB arasında olmalıdır.";
        }

        if (o.MaxPixels < 10_000 || o.MinEdge < 1 || o.MaxEdge < o.MinEdge || o.MaxEdge > 8000)
        {
            return "Uploads:MaxPixels, MinEdge ve MaxEdge değerleri tutarlı olmalıdır.";
        }

        if (o.JpegQuality is < 30 or > 100)
        {
            return "Uploads:JpegQuality 30 ile 100 arasında olmalıdır.";
        }

        if (o.MaxConcurrentProcessing is < 1 or > 16)
        {
            return "Uploads:MaxConcurrentProcessing 1 ile 16 arasında olmalıdır.";
        }

        if (o.PendingTimeoutMinutes < 5 || o.UnusedRetentionDays < 1 || o.CleanupIntervalMinutes < 1 || o.CleanupBatchSize is < 1 or > 1000)
        {
            return "Uploads temizlik ayarları geçersiz.";
        }

        return null;
    }
}

public sealed class StorageOptionsValidator : Microsoft.Extensions.Options.IValidateOptions<StorageOptions>
{
    public Microsoft.Extensions.Options.ValidateOptionsResult Validate(string? name, StorageOptions options) =>
        StorageOptions.Validate(options) is { } message
            ? Microsoft.Extensions.Options.ValidateOptionsResult.Fail(message)
            : Microsoft.Extensions.Options.ValidateOptionsResult.Success;
}

public sealed class UploadOptionsValidator : Microsoft.Extensions.Options.IValidateOptions<UploadOptions>
{
    public Microsoft.Extensions.Options.ValidateOptionsResult Validate(string? name, UploadOptions options) =>
        UploadOptions.Validate(options) is { } message
            ? Microsoft.Extensions.Options.ValidateOptionsResult.Fail(message)
            : Microsoft.Extensions.Options.ValidateOptionsResult.Success;
}

public static class StorageOptionsExtensions
{
    public static IServiceCollection AddStorageOptions(this IServiceCollection services, Microsoft.Extensions.Configuration.IConfiguration configuration)
    {
        services.AddSingleton<Microsoft.Extensions.Options.IValidateOptions<StorageOptions>, StorageOptionsValidator>();
        services.AddSingleton<Microsoft.Extensions.Options.IValidateOptions<UploadOptions>, UploadOptionsValidator>();
        services.AddOptions<StorageOptions>().Bind(configuration.GetSection(StorageOptions.SectionName)).ValidateOnStart();
        services.AddOptions<UploadOptions>().Bind(configuration.GetSection(UploadOptions.SectionName)).ValidateOnStart();
        return services;
    }
}
