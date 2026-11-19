using LGSApp.Api.Extensions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;

namespace LGSApp.Tests.Api;

public sealed class ApiFactory(string database, bool blobHealthy = true, Dictionary<string, string?>? settings = null, LogCapture? logs = null) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:DefaultConnection", TestDatabase.ConnectionString(database));
        builder.UseSetting("Storage:CreateContainerIfMissing", "false");
        builder.UseSetting("Scheduler:Enabled", "false");
        builder.UseSetting("Uploads:CleanupEnabled", "false");
        builder.UseSetting("Seed:Enabled", "false");
        foreach (var (key, value) in settings ?? [])
        {
            builder.UseSetting(key, value);
        }

        if (logs is not null)
        {
            builder.ConfigureLogging(logging =>
            {
                logging.ClearProviders();
                logging.AddProvider(logs);
            });
        }

        builder.ConfigureTestServices(services =>
        {
            services.Configure<HealthCheckServiceOptions>(options =>
            {
                var existing = options.Registrations.First(r => r.Name == "blob");
                options.Registrations.Remove(existing);
                options.Registrations.Add(new HealthCheckRegistration("blob", _ => new StubHealthCheck(blobHealthy), null, [HttpSecurityExtensions.ReadyTag]));
            });
        });
    }

    private sealed class StubHealthCheck(bool healthy) : IHealthCheck
    {
        public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(healthy ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("stub"));
    }
}

public sealed class LogCapture : ILoggerProvider
{
    private readonly System.Collections.Concurrent.ConcurrentQueue<string> entries = new();

    public string Text => string.Join('\n', entries);

    public ILogger CreateLogger(string categoryName) => new CaptureLogger(categoryName, entries);

    public void Dispose()
    {
    }

    private sealed class CaptureLogger(string category, System.Collections.Concurrent.ConcurrentQueue<string> entries) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var extra = state is IEnumerable<KeyValuePair<string, object?>> pairs
                ? string.Join(' ', pairs.Select(p => $"{p.Key}={p.Value}"))
                : string.Empty;
            entries.Enqueue($"{category} {logLevel} {formatter(state, exception)} {extra} {exception}");
        }
    }
}
