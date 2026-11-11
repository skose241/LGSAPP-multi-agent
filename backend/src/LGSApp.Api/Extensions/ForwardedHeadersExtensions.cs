using System.Net;
using LGSApp.Api.Options;
using Microsoft.AspNetCore.HttpOverrides;

namespace LGSApp.Api.Extensions;

public static class ForwardedHeadersExtensions
{
    public static IServiceCollection AddAppForwardedHeaders(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        if (environment.IsDevelopment())
        {
            return services;
        }

        var settings = Read(configuration);
        if (!settings.Enabled)
        {
            return services;
        }

        var proxies = new List<IPAddress>();
        foreach (var value in settings.KnownProxies.Where(v => !string.IsNullOrWhiteSpace(v)))
        {
            if (!IPAddress.TryParse(value.Trim(), out var address))
            {
                throw new InvalidOperationException($"ForwardedHeaders:KnownProxies içinde geçersiz IP adresi var: '{value}'.");
            }

            proxies.Add(address);
        }

        var networks = new List<System.Net.IPNetwork>();
        foreach (var value in settings.KnownNetworks.Where(v => !string.IsNullOrWhiteSpace(v)))
        {
            if (!System.Net.IPNetwork.TryParse(value.Trim(), out var network))
            {
                throw new InvalidOperationException($"ForwardedHeaders:KnownNetworks içinde geçersiz CIDR değeri var: '{value}'. Örnek: 10.0.0.0/8");
            }

            networks.Add(network);
        }

        if (proxies.Count == 0 && networks.Count == 0)
        {
            throw new InvalidOperationException(
                "ForwardedHeaders:Enabled açık ancak güvenilen proxy tanımlı değil. ForwardedHeaders:KnownProxies veya ForwardedHeaders:KnownNetworks alanlarından en az biri doldurulmalıdır.");
        }

        if (settings.ForwardLimit < 1)
        {
            throw new InvalidOperationException("ForwardedHeaders:ForwardLimit en az 1 olmalıdır.");
        }

        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.KnownProxies.Clear();
            options.KnownIPNetworks.Clear();
            foreach (var proxy in proxies)
            {
                options.KnownProxies.Add(proxy);
            }

            foreach (var network in networks)
            {
                options.KnownIPNetworks.Add(network);
            }

            options.ForwardLimit = settings.ForwardLimit;
        });

        return services;
    }

    public static IApplicationBuilder UseAppForwardedHeaders(
        this IApplicationBuilder app,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        if (environment.IsDevelopment() || !Read(configuration).Enabled)
        {
            return app;
        }

        return app.UseForwardedHeaders();
    }

    private static ForwardedHeadersSettings Read(IConfiguration configuration) =>
        configuration.GetSection(ForwardedHeadersSettings.SectionName).Get<ForwardedHeadersSettings>()
        ?? new ForwardedHeadersSettings();
}
