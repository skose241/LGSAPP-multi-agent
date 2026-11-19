using LGSApp.Api.Extensions;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Time.Testing;

namespace LGSApp.Tests.Api;

public class ReadinessCacheTests
{
    private sealed class CountingHealthCheckService(Func<HealthStatus> status) : HealthCheckService
    {
        private int calls;

        public int Calls => Volatile.Read(ref calls);

        public override async Task<HealthReport> CheckHealthAsync(Func<HealthCheckRegistration, bool>? predicate, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref calls);
            await Task.Delay(50, cancellationToken);
            var entry = new HealthReportEntry(status(), null, TimeSpan.Zero, null, null);
            return new HealthReport(new Dictionary<string, HealthReportEntry> { ["x"] = entry }, TimeSpan.Zero);
        }
    }

    [Fact]
    public async Task Concurrent_calls_share_a_single_check()
    {
        var service = new CountingHealthCheckService(() => HealthStatus.Healthy);
        var cache = new ReadinessCache(service, new FakeTimeProvider());

        var results = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => cache.IsHealthyAsync()));

        Assert.All(results, Assert.True);
        Assert.Equal(1, service.Calls);
    }

    [Fact]
    public async Task Result_is_cached_for_twenty_seconds_then_refreshed()
    {
        var status = HealthStatus.Healthy;
        var service = new CountingHealthCheckService(() => status);
        var time = new FakeTimeProvider();
        var cache = new ReadinessCache(service, time);

        Assert.True(await cache.IsHealthyAsync());
        status = HealthStatus.Unhealthy;
        time.Advance(TimeSpan.FromSeconds(19));
        Assert.True(await cache.IsHealthyAsync());
        Assert.Equal(1, service.Calls);

        time.Advance(TimeSpan.FromSeconds(2));
        Assert.False(await cache.IsHealthyAsync());
        Assert.Equal(2, service.Calls);
        Assert.False(await cache.IsHealthyAsync());
        Assert.Equal(2, service.Calls);
    }

    [Fact]
    public async Task Degraded_is_not_healthy()
    {
        var cache = new ReadinessCache(new CountingHealthCheckService(() => HealthStatus.Degraded), new FakeTimeProvider());

        Assert.False(await cache.IsHealthyAsync());
    }
}
