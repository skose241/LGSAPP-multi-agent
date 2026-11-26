using LGSApp.Api;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Tests.Api;

public class ResetDatabaseCommandTests
{
    [Fact]
    public async Task Mismatching_confirmation_name_deletes_nothing()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, SeedLessonAsync))
        {
            return;
        }

        try
        {
            var (code, output, error) = await RunAsync(name, "reset-database", "--confirm", "BaskaVeritabani");

            Assert.Equal(1, code);
            Assert.Equal("", output);
            Assert.Contains("eşleşmiyor", error);
            await using var db = TestDatabase.Open(name);
            Assert.Equal(1, await db.Lessons.CountAsync());
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        }
        finally
        {
            await TestDatabase.DropAsync(name);
        }
    }

    [Fact]
    public async Task Confirmation_name_is_case_sensitive()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, SeedLessonAsync))
        {
            return;
        }

        try
        {
            var (code, _, _) = await RunAsync(name, "reset-database", "--confirm", name.ToUpperInvariant());

            Assert.Equal(1, code);
            await using var db = TestDatabase.Open(name);
            Assert.Equal(1, await db.Lessons.CountAsync());
        }
        finally
        {
            await TestDatabase.DropAsync(name);
        }
    }

    [Fact]
    public async Task Missing_confirmation_is_rejected_before_connecting()
    {
        var (code, _, error) = await RunAsync("yok", "reset-database");

        Assert.Equal(1, code);
        Assert.Contains("Geçersiz seçenekler", error);
    }

    [Fact]
    public async Task Dry_run_prints_row_counts_and_deletes_nothing()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, SeedLessonAsync))
        {
            return;
        }

        try
        {
            var (code, output, _) = await RunAsync(name, "reset-database", "--dry-run");

            Assert.Equal(0, code);
            Assert.Contains($"Veritabanı: {name}", output);
            Assert.Contains("Lessons: 1", output);
            Assert.Contains("Questions: 0", output);
            Assert.Contains("hiçbir şey yazılmadı", output);
            await using var db = TestDatabase.Open(name);
            Assert.Equal(1, await db.Lessons.CountAsync());
        }
        finally
        {
            await TestDatabase.DropAsync(name);
        }
    }

    [Fact]
    public async Task Confirmed_reset_drops_every_table_and_schema_can_be_recreated()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, SeedLessonAsync))
        {
            return;
        }

        try
        {
            var (code, output, error) = await RunAsync(name, "reset-database", "--confirm", name);

            Assert.Equal(0, code);
            Assert.Equal("", error);
            Assert.Contains("silindi", output);
            await using (var connection = new SqlConnection(TestDatabase.ConnectionString(name)))
            {
                await connection.OpenAsync();
                await using var command = connection.CreateCommand();
                command.CommandText = "SELECT COUNT(*) FROM sys.tables";
                Assert.Equal(0, (int)(await command.ExecuteScalarAsync())!);
            }

            await using var db = TestDatabase.Open(name);
            await db.Database.MigrateAsync();
            Assert.Equal(0, await db.Lessons.CountAsync());
            Assert.Equal(0, await db.Users.CountAsync());
        }
        finally
        {
            await TestDatabase.DropAsync(name);
        }
    }

    [Fact]
    public async Task Failure_midway_rolls_everything_back()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, SeedLessonAsync))
        {
            return;
        }

        try
        {
            await using var connection = new SqlConnection(TestDatabase.ConnectionString(name));
            await connection.OpenAsync();
            var foreignKeysBefore = await CountAsync(connection, "SELECT COUNT(*) FROM sys.foreign_keys");
            var tablesBefore = await CountAsync(connection, "SELECT COUNT(*) FROM sys.tables");
            Assert.True(foreignKeysBefore > 0);
            await using (var trigger = connection.CreateCommand())
            {
                trigger.CommandText = "CREATE TRIGGER BlockTableDrop ON DATABASE FOR DROP_TABLE AS THROW 50001, N'engellendi', 1;";
                await trigger.ExecuteNonQueryAsync();
            }

            var (code, _, error) = await RunAsync(name, "reset-database", "--confirm", name);

            Assert.Equal(1, code);
            Assert.Contains("engellendi", error);
            Assert.Equal(foreignKeysBefore, await CountAsync(connection, "SELECT COUNT(*) FROM sys.foreign_keys"));
            Assert.Equal(tablesBefore, await CountAsync(connection, "SELECT COUNT(*) FROM sys.tables"));
            await using var db = TestDatabase.Open(name);
            Assert.Equal(1, await db.Lessons.CountAsync());
        }
        finally
        {
            SqlConnection.ClearAllPools();
            await TestDatabase.DropAsync(name);
        }
    }

    [Fact]
    public async Task Dry_run_reports_other_user_sessions()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, SeedLessonAsync))
        {
            return;
        }

        try
        {
            SqlConnection.ClearAllPools();
            var (code, output, _) = await RunAsync(name, "reset-database", "--dry-run");

            Assert.Equal(0, code);
            Assert.Contains("Diğer kullanıcı oturumları:", output);
        }
        finally
        {
            SqlConnection.ClearAllPools();
            await TestDatabase.DropAsync(name);
        }
    }

    private static async Task<int> CountAsync(SqlConnection connection, string sql)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        return (int)(await command.ExecuteScalarAsync())!;
    }

    [Fact]
    public async Task System_databases_are_refused()
    {
        var output = new StringWriter();
        var error = new StringWriter();
        var args = new[]
        {
            "reset-database", "--confirm", "master",
            $"--ConnectionStrings:DefaultConnection={TestDatabase.ConnectionString("master")}",
            "--RecoveryCodes:Pepper=dGVzdC1wZXBwZXItdGVzdC1wZXBwZXItdGVzdC1wZXBwZXItdGVzdC1wZXBwZXI="
        };

        var code = await ServerCommands.RunAsync(args, output, error);

        Assert.Equal(1, code);
        Assert.Contains("sistem veritabanıdır", error.ToString());
    }

    private static async Task SeedLessonAsync(AppDbContext db)
    {
        db.Lessons.Add(new Lesson { Name = "Türkçe", Session = LessonSession.Sozel, OrderNo = 1, IsActive = true });
        await db.SaveChangesAsync();
    }

    private static async Task<(int Code, string Output, string Error)> RunAsync(string database, params string[] commandArgs)
    {
        var output = new StringWriter();
        var error = new StringWriter();
        var args = commandArgs
            .Append($"--ConnectionStrings:DefaultConnection={TestDatabase.ConnectionString(database)}")
            .Append("--RecoveryCodes:Pepper=dGVzdC1wZXBwZXItdGVzdC1wZXBwZXItdGVzdC1wZXBwZXItdGVzdC1wZXBwZXI=")
            .ToArray();
        var code = await ServerCommands.RunAsync(args, output, error);
        return (code, output.ToString(), error.ToString());
    }
}
