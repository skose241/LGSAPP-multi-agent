using System.Net;
using System.Net.Http.Json;

namespace LGSApp.Tests.Api;

public class HeadersAndHealthTests : IAsyncLifetime
{
    private readonly string _database = TestDatabase.NewName();
    private bool _available;

    public async Task InitializeAsync() =>
        _available = await TestDatabase.TryCreateAsync(_database, _ => Task.CompletedTask);

    public async Task DisposeAsync()
    {
        if (_available)
        {
            await TestDatabase.DropAsync(_database);
        }
    }

    [Theory]
    [InlineData("/health")]
    [InlineData("/health/live")]
    public async Task Live_endpoints_return_ok_with_nosniff(string path)
    {
        if (!_available)
        {
            return;
        }

        await using var factory = new ApiFactory(_database);
        using var client = factory.CreateClient();
        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
    }

    [Fact]
    public async Task Ready_returns_ok_when_dependencies_are_healthy()
    {
        if (!_available)
        {
            return;
        }

        await using var factory = new ApiFactory(_database, blobHealthy: true);
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Ready_returns_503_when_blob_is_unhealthy_but_live_stays_ok()
    {
        if (!_available)
        {
            return;
        }

        await using var factory = new ApiFactory(_database, blobHealthy: false);
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health/ready")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }

    [Fact]
    public async Task Ready_returns_503_when_database_is_unreachable()
    {
        if (!_available)
        {
            return;
        }

        var settings = new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = "Server=127.0.0.1,1;Database=x;User Id=a;Password=b;Connect Timeout=2;TrustServerCertificate=True"
        };
        await using var factory = new ApiFactory(_database, settings: settings);
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health/ready")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
    }

    [Fact]
    public async Task Json_api_responses_are_not_cached_and_not_sniffed()
    {
        if (!_available)
        {
            return;
        }

        await using var factory = new ApiFactory(_database);
        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { userName = "yok", password = "Yanlis-Sifre-1" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("no-store", response.Headers.CacheControl?.ToString());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
    }
}
