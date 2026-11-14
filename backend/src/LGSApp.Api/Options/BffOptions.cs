using Microsoft.Extensions.Options;

namespace LGSApp.Api.Options;

public sealed class BffOptions
{
    public const string SectionName = "Bff";
    public const int MinProxyKeyLength = 32;
    public const string ProxyKeyHeader = "X-LGS-Proxy-Key";
    public const string ClientIpHeader = "X-LGS-Client-IP";

    public string ProxyKey { get; set; } = string.Empty;

    public bool Enabled => !string.IsNullOrEmpty(ProxyKey);

    public static string? Validate(BffOptions options)
    {
        if (string.IsNullOrEmpty(options.ProxyKey))
        {
            return null;
        }

        if (options.ProxyKey.Length < MinProxyKeyLength)
        {
            return $"Bff:ProxyKey en az {MinProxyKeyLength} karakter olmalıdır.";
        }

        if (options.ProxyKey.Any(char.IsWhiteSpace))
        {
            return "Bff:ProxyKey boşluk karakteri içeremez.";
        }

        return null;
    }
}

public sealed class BffOptionsValidator : IValidateOptions<BffOptions>
{
    public ValidateOptionsResult Validate(string? name, BffOptions options) =>
        BffOptions.Validate(options) is { } message ? ValidateOptionsResult.Fail(message) : ValidateOptionsResult.Success;
}
