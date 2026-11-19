using LGSApp.Api;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LGSApp.Tests.Api;

public class SeedReferenceDataCommandTests
{
    [Fact]
    public async Task Empty_database_gets_all_reference_lessons_and_topics()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, _ => Task.CompletedTask))
        {
            return;
        }

        try
        {
            var (code, output, error) = await RunAsync(name, "seed-reference-data");

            Assert.Equal(0, code);
            Assert.Equal("", error);
            Assert.Contains($"Dersler: {ReferenceData.Lessons.Count} eklendi, 0 zaten vardı.", output);
            Assert.Contains($"Konular: {ReferenceData.Topics.Count} eklendi, 0 zaten vardı.", output);
            await using var db = TestDatabase.Open(name);
            Assert.Equal(ReferenceData.Lessons.Count, await db.Lessons.CountAsync());
            Assert.Equal(ReferenceData.Topics.Count, await db.Topics.CountAsync());
        }
        finally
        {
            await TestDatabase.DropAsync(name);
        }
    }

    [Fact]
    public async Task Second_run_adds_nothing()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, _ => Task.CompletedTask))
        {
            return;
        }

        try
        {
            await RunAsync(name, "seed-reference-data");
            var (code, output, _) = await RunAsync(name, "seed-reference-data");

            Assert.Equal(0, code);
            Assert.Contains($"Dersler: 0 eklendi, {ReferenceData.Lessons.Count} zaten vardı.", output);
            Assert.Contains($"Konular: 0 eklendi, {ReferenceData.Topics.Count} zaten vardı.", output);
            await using var db = TestDatabase.Open(name);
            Assert.Equal(ReferenceData.Lessons.Count, await db.Lessons.CountAsync());
            Assert.Equal(ReferenceData.Topics.Count, await db.Topics.CountAsync());
        }
        finally
        {
            await TestDatabase.DropAsync(name);
        }
    }

    [Fact]
    public async Task Teacher_added_and_edited_records_are_preserved()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, _ => Task.CompletedTask))
        {
            return;
        }

        try
        {
            await RunAsync(name, "seed-reference-data");
            await using (var db = TestDatabase.Open(name))
            {
                var turkce = await db.Lessons.SingleAsync(l => l.Name == "Türkçe");
                db.Topics.Add(new Topic { LessonId = turkce.Id, Name = "Öğretmen Konusu", OrderNo = 99, IsActive = true });
                var fiilimsiler = await db.Topics.SingleAsync(t => t.Name == "Fiilimsiler");
                fiilimsiler.IsActive = false;
                fiilimsiler.OrderNo = 42;
                var matematik = await db.Lessons.SingleAsync(l => l.Name == "Matematik");
                matematik.IsActive = false;
                await db.SaveChangesAsync();
            }

            var (code, _, _) = await RunAsync(name, "seed-reference-data");

            Assert.Equal(0, code);
            await using var verify = TestDatabase.Open(name);
            Assert.True(await verify.Topics.AnyAsync(t => t.Name == "Öğretmen Konusu" && t.OrderNo == 99));
            var edited = await verify.Topics.SingleAsync(t => t.Name == "Fiilimsiler");
            Assert.False(edited.IsActive);
            Assert.Equal(42, edited.OrderNo);
            Assert.False((await verify.Lessons.SingleAsync(l => l.Name == "Matematik")).IsActive);
            Assert.Equal(ReferenceData.Topics.Count + 1, await verify.Topics.CountAsync());
        }
        finally
        {
            await TestDatabase.DropAsync(name);
        }
    }

    [Fact]
    public async Task Missing_items_are_added_to_a_partially_seeded_database()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, _ => Task.CompletedTask))
        {
            return;
        }

        try
        {
            await RunAsync(name, "seed-reference-data");
            await using (var db = TestDatabase.Open(name))
            {
                var topic = await db.Topics.SingleAsync(t => t.Name == "Üslü İfadeler");
                db.Topics.Remove(topic);
                await db.SaveChangesAsync();
            }

            var (code, output, _) = await RunAsync(name, "seed-reference-data");

            Assert.Equal(0, code);
            Assert.Contains("Konular: 1 eklendi", output);
            Assert.Contains("Matematik / Üslü İfadeler", output);
            await using var verify = TestDatabase.Open(name);
            Assert.Equal(ReferenceData.Topics.Count, await verify.Topics.CountAsync());
        }
        finally
        {
            await TestDatabase.DropAsync(name);
        }
    }

    [Fact]
    public async Task Dry_run_lists_changes_without_writing()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, _ => Task.CompletedTask))
        {
            return;
        }

        try
        {
            var (code, output, _) = await RunAsync(name, "seed-reference-data", "--dry-run");

            Assert.Equal(0, code);
            Assert.Contains("hiçbir şey yazılmadı", output);
            Assert.Contains($"Dersler: {ReferenceData.Lessons.Count} eklenecek", output);
            Assert.Contains($"Konular: {ReferenceData.Topics.Count} eklenecek", output);
            Assert.Contains("Ders eklenecek: Türkçe", output);
            await using var db = TestDatabase.Open(name);
            Assert.Equal(0, await db.Lessons.CountAsync());
            Assert.Equal(0, await db.Topics.CountAsync());
        }
        finally
        {
            await TestDatabase.DropAsync(name);
        }
    }

    [Fact]
    public async Task Pending_migration_fails_with_clear_error_and_writes_nothing()
    {
        var name = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(name, _ => Task.CompletedTask))
        {
            return;
        }

        try
        {
            await using (var db = TestDatabase.Open(name))
            {
                var first = db.Database.GetMigrations().First();
                await db.GetService<IMigrator>().MigrateAsync(first);
            }

            var (code, output, error) = await RunAsync(name, "seed-reference-data");

            Assert.Equal(1, code);
            Assert.Equal("", output);
            Assert.Contains("uygulanmamış migration", error);
            await using var verify = TestDatabase.Open(name);
            Assert.Single(await verify.Database.GetAppliedMigrationsAsync());
        }
        finally
        {
            await TestDatabase.DropAsync(name);
        }
    }

    [Fact]
    public async Task Unknown_option_is_rejected()
    {
        var (code, _, error) = await RunAsync("yok", "seed-reference-data", "--hepsini-sil");

        Assert.Equal(1, code);
        Assert.Contains("Bilinmeyen seçenek", error);
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
