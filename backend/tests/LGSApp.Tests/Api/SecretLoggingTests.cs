using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LGSApp.Tests.Api;

public class SecretLoggingTests : IAsyncLifetime
{
    private const string SeedPassword = "Tohum-Parola-84Qxz";
    private const string NewPassword = "Yeni-Mudur-Parola-93Zq";

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

    [Fact]
    public async Task Debug_logs_never_contain_passwords_tokens_pepper_or_seed_password()
    {
        if (!_available)
        {
            return;
        }

        var logs = new LogCapture();
        var settings = new Dictionary<string, string?>
        {
            ["Logging:LogLevel:Default"] = "Debug",
            ["Logging:LogLevel:Microsoft"] = "Debug",
            ["Logging:LogLevel:Microsoft.AspNetCore"] = "Debug",
            ["Logging:LogLevel:Microsoft.EntityFrameworkCore"] = "Debug",
            ["Seed:Enabled"] = "true",
            ["Seed:AdminUserName"] = "mudurlog",
            ["Seed:AdminPassword"] = SeedPassword
        };

        await using var factory = new ApiFactory(_database, settings: settings, logs: logs);
        using var client = factory.CreateClient();
        var secrets = new List<string> { SeedPassword, NewPassword };

        var login = await client.PostAsJsonAsync("/api/auth/login", new { userName = "mudurlog", password = SeedPassword });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Collect(await login.Content.ReadAsStringAsync(), secrets);
        var first = JsonDocument.Parse(await login.Content.ReadAsStringAsync()).RootElement;

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", first.GetProperty("token").GetString());
        var change = await client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = SeedPassword, newPassword = NewPassword });
        var changeBody = await change.Content.ReadAsStringAsync();
        Assert.True(change.IsSuccessStatusCode, changeBody);
        Collect(changeBody, secrets);
        var second = JsonDocument.Parse(changeBody).RootElement;

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", second.GetProperty("token").GetString());
        var bulk = await client.PostAsJsonAsync("/api/admin/users/bulk", new
        {
            items = new[] { new { userName = "ogrlog1", firstName = "Ali", lastName = "Veli", role = "ogrenci", className = "8-A" } }
        });
        var bulkBody = await bulk.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Created, bulk.StatusCode);
        Collect(bulkBody, secrets);

        var configuration = factory.Services.GetRequiredService<IConfiguration>();
        secrets.Add(configuration["Jwt:Key"]!);
        secrets.Add(configuration["RecoveryCodes:Pepper"]!);

        var text = logs.Text;
        Assert.True(text.Length > 0);
        foreach (var secret in secrets.Where(s => !string.IsNullOrWhiteSpace(s)).Distinct())
        {
            Assert.DoesNotContain(secret, text);
        }
    }

    private static void Collect(string json, List<string> secrets)
    {
        using var document = JsonDocument.Parse(json);
        Walk(document.RootElement, secrets);
    }

    private static void Walk(JsonElement element, List<string> secrets)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    if (property.Name is "token" or "refreshToken" or "oneTimePassword" && property.Value.ValueKind == JsonValueKind.String)
                    {
                        secrets.Add(property.Value.GetString()!);
                    }
                    else
                    {
                        Walk(property.Value, secrets);
                    }
                }

                break;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.String)
                    {
                        secrets.Add(item.GetString()!);
                    }
                    else
                    {
                        Walk(item, secrets);
                    }
                }

                break;
        }
    }
}
