using LGSApp.Infrastructure.Persistence;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Tests;

public static class TestDatabase
{
    private const string Server = "Server=(localdb)\\MSSQLLocalDB;Trusted_Connection=True;TrustServerCertificate=True;";

    public static string NewName() => "LGSApp_Test_" + Guid.NewGuid().ToString("N");

    public static AppDbContext Open(string name) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer($"{Server}Database={name};").Options);

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
