using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LGSApp.Infrastructure.Options;

public class RecoveryCodeOptions
{
    public const string SectionName = "RecoveryCodes";
    public const int MinPepperBytes = 32;

    public string Pepper { get; set; } = string.Empty;

    public byte[] PepperBytes()
    {
        if (!TryDecode(Pepper, out var bytes))
        {
            throw new InvalidOperationException(InvalidMessage);
        }

        return bytes;
    }

    public const string InvalidMessage =
        "RecoveryCodes:Pepper tanımlı değil veya geçersiz. En az 32 bayt uzunluğunda base64 bir değer verilmelidir (örnek: 'openssl rand -base64 48'). Ortam değişkeni: RecoveryCodes__Pepper.";

    public static bool TryDecode(string? value, out byte[] bytes)
    {
        bytes = [];
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var buffer = new byte[value.Length];
        if (!Convert.TryFromBase64String(value.Trim(), buffer, out var written) || written < MinPepperBytes)
        {
            return false;
        }

        bytes = buffer[..written];
        return true;
    }
}

public static class RecoveryCodeOptionsExtensions
{
    public static IServiceCollection AddRecoveryCodeOptions(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(RecoveryCodeOptions.SectionName);
        var options = section.Get<RecoveryCodeOptions>() ?? new RecoveryCodeOptions();
        if (!RecoveryCodeOptions.TryDecode(options.Pepper, out _))
        {
            throw new InvalidOperationException(RecoveryCodeOptions.InvalidMessage);
        }

        services.Configure<RecoveryCodeOptions>(section);
        return services;
    }
}
