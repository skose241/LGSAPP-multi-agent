using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Files;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace LGSApp.Api.Extensions;

public static class HttpSecurityExtensions
{
    public const string ReadyTag = "ready";

    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            context.Response.OnStarting(static state =>
            {
                var response = ((HttpContext)state).Response;
                response.Headers.XContentTypeOptions = "nosniff";
                if (!response.Headers.ContainsKey("Cache-Control") && IsJson(response.ContentType))
                {
                    response.Headers.CacheControl = "no-store";
                }

                return Task.CompletedTask;
            }, context);
            await next();
        });

    public static IServiceCollection AddAppHealthChecks(this IServiceCollection services)
    {
        services.AddHealthChecks()
            .AddCheck<DatabaseHealthCheck>("database", tags: [ReadyTag])
            .AddCheck<BlobHealthCheck>("blob", tags: [ReadyTag]);
        services.AddSingleton<ReadinessCache>();
        return services;
    }

    public static void MapAppHealth(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapHealthChecks("/health", new() { Predicate = _ => false }).AllowAnonymous();
        endpoints.MapHealthChecks("/health/live", new() { Predicate = _ => false }).AllowAnonymous();
        endpoints.MapGet("/health/ready", async (HttpContext context, ReadinessCache cache) =>
        {
            var healthy = await cache.IsHealthyAsync();
            context.Response.Headers.CacheControl = "no-store, no-cache";
            context.Response.StatusCode = healthy ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable;
            context.Response.ContentType = "text/plain";
            await context.Response.WriteAsync(healthy ? "Healthy" : "Unhealthy");
        }).AllowAnonymous().ExcludeFromDescription();
    }

    private static bool IsJson(string? contentType) =>
        contentType is not null && contentType.Contains("json", StringComparison.OrdinalIgnoreCase);
}

public sealed class ReadinessCache(HealthCheckService healthChecks, TimeProvider timeProvider)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(20);

    private static readonly TimeSpan CheckTimeout = TimeSpan.FromSeconds(15);

    private readonly SemaphoreSlim gate = new(1, 1);
    private bool healthy;
    private DateTimeOffset expiresAt = DateTimeOffset.MinValue;

    public async Task<bool> IsHealthyAsync()
    {
        await gate.WaitAsync();
        try
        {
            var now = timeProvider.GetUtcNow();
            if (now < expiresAt)
            {
                return healthy;
            }

            using var timeout = new CancellationTokenSource(CheckTimeout);
            try
            {
                var report = await healthChecks.CheckHealthAsync(r => r.Tags.Contains(HttpSecurityExtensions.ReadyTag), timeout.Token);
                healthy = report.Status == HealthStatus.Healthy;
            }
            catch (OperationCanceledException)
            {
                healthy = false;
            }

            expiresAt = timeProvider.GetUtcNow() + Lifetime;
            return healthy;
        }
        finally
        {
            gate.Release();
        }
    }
}

public sealed class DatabaseHealthCheck(AppDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            return await db.Database.CanConnectAsync(cancellationToken)
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Unhealthy("Veritabanına bağlanılamadı.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return HealthCheckResult.Unhealthy("Veritabanı denetimi başarısız.", ex);
        }
    }
}

public sealed class BlobHealthCheck(AzureBlobStore store) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(5));
            var exists = await store.Container.ExistsAsync(timeout.Token);
            return exists.Value
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Unhealthy("Depolama kabı bulunamadı.");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Depolama denetimi başarısız.", ex);
        }
    }
}
