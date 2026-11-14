using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using LGSApp.Api.Options;
using Microsoft.Extensions.Options;

namespace LGSApp.Api.Extensions;

public sealed class BffClientIpResolver
{
    private const int MaxIpLength = 45;

    private readonly byte[]? _keyDigest;

    public BffClientIpResolver(BffOptions options)
    {
        _keyDigest = options.Enabled ? SHA256.HashData(Encoding.UTF8.GetBytes(options.ProxyKey)) : null;
    }

    public bool Enabled => _keyDigest is not null;

    public IPAddress? Resolve(IHeaderDictionary headers)
    {
        if (_keyDigest is null)
        {
            return null;
        }

        var keyValues = headers[BffOptions.ProxyKeyHeader];
        if (keyValues.Count != 1 || string.IsNullOrEmpty(keyValues[0]))
        {
            return null;
        }

        var presented = SHA256.HashData(Encoding.UTF8.GetBytes(keyValues[0]!));
        if (!CryptographicOperations.FixedTimeEquals(presented, _keyDigest))
        {
            return null;
        }

        var ipValues = headers[BffOptions.ClientIpHeader];
        return ipValues.Count == 1 ? ParseIp(ipValues[0]) : null;
    }

    public static IPAddress? ParseIp(string? value)
    {
        var text = value?.Trim();
        if (string.IsNullOrEmpty(text) || text.Length > MaxIpLength)
        {
            return null;
        }

        var isV6 = text.Contains(':');
        if (!isV6 && text.Count(c => c == '.') != 3)
        {
            return null;
        }

        if (!IPAddress.TryParse(text, out var address))
        {
            return null;
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any) || address.Equals(IPAddress.Broadcast) || address.Equals(IPAddress.None))
        {
            return null;
        }

        if (address.AddressFamily == AddressFamily.InterNetworkV6 && address.ScopeId != 0)
        {
            return new IPAddress(address.GetAddressBytes());
        }

        return address;
    }
}

public sealed class BffClientIpMiddleware(RequestDelegate next, BffClientIpResolver resolver)
{
    public Task InvokeAsync(HttpContext context)
    {
        if (resolver.Enabled)
        {
            var address = resolver.Resolve(context.Request.Headers);
            if (address is not null)
            {
                context.Connection.RemoteIpAddress = address;
            }

            context.Request.Headers.Remove(BffOptions.ProxyKeyHeader);
            context.Request.Headers.Remove(BffOptions.ClientIpHeader);
        }

        return next(context);
    }
}

public static class BffClientIpExtensions
{
    public static IServiceCollection AddBffClientIp(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<IValidateOptions<BffOptions>, BffOptionsValidator>();
        services.AddOptions<BffOptions>().Bind(configuration.GetSection(BffOptions.SectionName)).ValidateOnStart();
        services.AddSingleton(sp => new BffClientIpResolver(sp.GetRequiredService<IOptions<BffOptions>>().Value));
        return services;
    }

    public static IApplicationBuilder UseBffClientIp(this IApplicationBuilder app)
    {
        var resolver = app.ApplicationServices.GetRequiredService<BffClientIpResolver>();
        if (!resolver.Enabled)
        {
            var environment = app.ApplicationServices.GetRequiredService<IHostEnvironment>();
            if (!environment.IsDevelopment())
            {
                app.ApplicationServices.GetRequiredService<ILoggerFactory>()
                    .CreateLogger("LGSApp.Api.Bff")
                    .LogWarning("Bff:ProxyKey tanımlı değil. Güvenilir BFF istemci IP özelliği kapalı; IP bölümlü hız sınırları tek bir adres üzerinden çalışabilir.");
            }

            return app;
        }

        return app.UseMiddleware<BffClientIpMiddleware>();
    }
}
