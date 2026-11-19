using LGSApp.Infrastructure.Persistence;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace LGSApp.Tests;

public static class TestDatabase
{
    public const string ServerVariable = "LGSAPP_TEST_SQL";
    public const string RequireVariable = "LGSAPP_TEST_REQUIRE_DB";

    private const string DefaultServer = "(localdb)\\MSSQLLocalDB";

    private static readonly string Server = BuildServer(Environment.GetEnvironmentVariable(ServerVariable));

    public static bool RequireDatabase =>
        string.Equals(Environment.GetEnvironmentVariable(RequireVariable)?.Trim(), "true", StringComparison.OrdinalIgnoreCase);

    public static string BuildServer(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return $"Server={DefaultServer};Trusted_Connection=True;TrustServerCertificate=True;";
        }

        if (!trimmed.Contains('='))
        {
            return $"Server={trimmed};Trusted_Connection=True;TrustServerCertificate=True;";
        }

        return trimmed.EndsWith(';') ? trimmed : trimmed + ";";
    }

    public static string NewName() => "LGSApp_Test_" + Guid.NewGuid().ToString("N");

    public static string ConnectionString(string name) => $"{Server}Database={name};";

    public static AppDbContext Open(string name) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(ConnectionString(name)).Options);

    public static AppDbContext Open(string name, params IInterceptor[] interceptors) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(ConnectionString(name)).AddInterceptors(interceptors).Options);

    public static async Task<bool> TryCreateAsync(string name, Func<AppDbContext, Task> seed)
    {
        try
        {
            await using var db = Open(name);
            await db.Database.MigrateAsync();
            await seed(db);
            return true;
        }
        catch (Exception ex)
        {
            await DropAsync(name);
            if (ex is SqlException && !await ServerReachableAsync())
            {
                if (RequireDatabase)
                {
                    throw new InvalidOperationException($"{RequireVariable}=true olduğu için test veritabanı sunucusuna erişilmesi zorunlu, ancak erişilemedi. Sunucu {ServerVariable} ortam değişkeniyle verilir (varsayılan {DefaultServer}).", ex);
                }

                return false;
            }

            throw;
        }
    }

    public static async Task DropAsync(string name)
    {
        try
        {
            await using var db = Open(name);
            await db.Database.EnsureDeletedAsync();
        }
        catch (SqlException)
        {
        }
    }

    private static async Task<bool> ServerReachableAsync()
    {
        try
        {
            await using var connection = new SqlConnection($"{Server}Database=master;Connect Timeout=5;");
            await connection.OpenAsync();
            return true;
        }
        catch (SqlException)
        {
            return false;
        }
    }
}
