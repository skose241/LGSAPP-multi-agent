using LGSApp.Infrastructure;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Api;

public static class ServerCommands
{
    public const string ResetMudurPassword = "reset-mudur-password";
    public const string SeedReferenceData = "seed-reference-data";
    public const string ResetDatabase = "reset-database";
    public const string DryRunOption = "--dry-run";
    public const string ConfirmOption = "--confirm";

    private static readonly string[] CountedTables =
    [
        "AspNetUsers", "Questions", "Answers", "Solutions", "Comments", "Assignments",
        "Notifications", "GenerationRuns", "AiLogs", "Topics", "Lessons", "StoredFiles"
    ];

    private static readonly string[] SystemDatabaseNames = ["master", "model", "msdb", "tempdb"];

    public static bool IsCommand(string[] args) =>
        args.Length > 0 && (args[0] is ResetMudurPassword or SeedReferenceData or ResetDatabase or "--help" or "-h" or "help" or "/?");

    public static Task<int> RunAsync(string[] args) => RunAsync(args, Console.Out, Console.Error);

    public static async Task<int> RunAsync(string[] args, TextWriter output, TextWriter error)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        var positional = args.Skip(1).Where(a => !IsConfigurationArgument(a)).ToList();
        if (args[0] is not (ResetMudurPassword or SeedReferenceData or ResetDatabase) || positional.Any(a => a is "--help" or "-h"))
        {
            return Help(output);
        }

        string? userName = null;
        string? confirmName = null;
        var dryRun = false;
        if (args[0] == ResetDatabase)
        {
            var usage = $"{ResetDatabase} {DryRunOption} | {ResetDatabase} {ConfirmOption} <veritabaniAdi>";
            if (positional.Count == 1 && positional[0] == DryRunOption)
            {
                dryRun = true;
            }
            else if (positional.Count == 2 && positional[0] == ConfirmOption && !string.IsNullOrWhiteSpace(positional[1]))
            {
                confirmName = positional[1].Trim();
            }
            else
            {
                return Fail(error, "Geçersiz seçenekler.", usage);
            }
        }
        else if (args[0] == ResetMudurPassword)
        {
            if (positional.Count != 1)
            {
                return Fail(error, "Kullanıcı adı belirtilmelidir.", ResetMudurPassword + " <kullaniciAdi>");
            }

            userName = positional[0];
        }
        else
        {
            var unknown = positional.FirstOrDefault(a => a != DryRunOption);
            if (unknown is not null)
            {
                return Fail(error, $"Bilinmeyen seçenek: {unknown}", $"{SeedReferenceData} [{DryRunOption}]");
            }

            dryRun = positional.Count > 0;
        }

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args.Skip(1).Where(a => IsConfigurationArgument(a)).Prepend(args[0]).ToArray(),
            ContentRootPath = AppContext.BaseDirectory
        });
        builder.Logging.ClearProviders();
        builder.Services.AddDataProtection();
        builder.Services.AddInfrastructure(builder.Configuration);

        try
        {
            await using var app = builder.Build();
            await using var scope = app.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            if (args[0] == ResetDatabase)
            {
                return await RunResetDatabaseAsync(db, dryRun, confirmName, output, error);
            }

            var failure = await CheckDatabaseAsync(db);
            if (failure is not null)
            {
                return Fail(error, failure);
            }

            if (args[0] == SeedReferenceData)
            {
                return await SeedReferenceDataAsync(db, dryRun, output);
            }

            var recovery = scope.ServiceProvider.GetRequiredService<MudurRecoveryService>();
            var outcome = await recovery.ResetByOperatorAsync(userName!);
            if (!outcome.Succeeded)
            {
                return Fail(error, outcome.Message);
            }

            output.WriteLine($"Müdür '{userName!.Trim()}' için şifre sıfırlandı.");
            output.WriteLine($"Tek seferlik şifre: {outcome.Password}");
            output.WriteLine("Bu şifre yalnızca bir kez gösterilir. İlk girişte değiştirilmesi zorunludur.");
            output.WriteLine("Tüm kurtarma kodları iptal edildi; ilk şifre değişikliğinde yeni kodlar verilecek.");
            output.WriteLine("Hesap kilidi kaldırıldı, eski oturumlar geçersiz kılındı, bekleyen şifre sıfırlama talepleri kapatıldı.");
            if (outcome.IsBanned)
            {
                output.WriteLine("UYARI: Hesap engelli (banlı) durumda; bu komut engeli kaldırmaz.");
            }

            return 0;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail(error, $"İşlem tamamlanamadı: {ex.GetBaseException().Message}");
        }
    }

    public static async Task<int> RunSeedReferenceDataAsync(AppDbContext db, bool dryRun, TextWriter output, TextWriter error)
    {
        try
        {
            var failure = await CheckDatabaseAsync(db);
            if (failure is not null)
            {
                return Fail(error, failure);
            }

            return await SeedReferenceDataAsync(db, dryRun, output);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail(error, $"İşlem tamamlanamadı: {ex.GetBaseException().Message}");
        }
    }

    public static async Task<int> RunResetDatabaseAsync(AppDbContext db, bool dryRun, string? confirmName, TextWriter output, TextWriter error)
    {
        try
        {
            var databaseName = new SqlConnectionStringBuilder(db.Database.GetConnectionString()).InitialCatalog;
            if (string.IsNullOrWhiteSpace(databaseName))
            {
                return Fail(error, "Bağlantı dizesinde veritabanı adı (Initial Catalog) bulunamadı.");
            }

            if (SystemDatabaseNames.Contains(databaseName, StringComparer.OrdinalIgnoreCase))
            {
                return Fail(error, $"'{databaseName}' sistem veritabanıdır; sıfırlanamaz.");
            }

            if (!dryRun && !string.Equals(confirmName, databaseName, StringComparison.Ordinal))
            {
                return Fail(error, $"Onay adı bağlantıdaki veritabanı adıyla eşleşmiyor. Hiçbir şey silinmedi. Bağlantıdaki veritabanı: '{databaseName}'.", $"{ResetDatabase} {ConfirmOption} <veritabaniAdi>");
            }

            if (!await db.Database.CanConnectAsync())
            {
                return Fail(error, "Veritabanına bağlanılamadı. ConnectionStrings__DefaultConnection değerini kontrol edin.");
            }

            var connection = db.Database.GetDbConnection();
            await connection.OpenAsync();
            var actual = await ScalarAsync(connection, "SELECT DB_NAME()");
            if (!string.Equals(actual, databaseName, StringComparison.Ordinal))
            {
                return Fail(error, $"Bağlanılan veritabanı ('{actual}') bağlantı dizesindeki ad ('{databaseName}') ile eşleşmiyor. Hiçbir şey silinmedi.");
            }

            output.WriteLine($"Veritabanı: {databaseName}");
            var otherSessions = await ScalarAsync(connection, "SELECT CAST(COUNT(*) AS varchar(30)) FROM sys.dm_exec_sessions WHERE is_user_process = 1 AND database_id = DB_ID() AND session_id <> @@SPID");
            output.WriteLine($"Diğer kullanıcı oturumları: {otherSessions}");
            foreach (var table in CountedTables)
            {
                var exists = await ScalarAsync(connection, $"SELECT CASE WHEN OBJECT_ID(N'dbo.{table}', N'U') IS NULL THEN '' ELSE 'x' END");
                var count = exists == "x" ? await ScalarAsync(connection, $"SELECT CAST(COUNT_BIG(*) AS varchar(30)) FROM dbo.[{table}]") : "yok";
                output.WriteLine($"  {table}: {count}");
            }

            if (dryRun)
            {
                output.WriteLine("Deneme çalıştırması (--dry-run): veritabanına hiçbir şey yazılmadı.");
                return 0;
            }

            await using (var command = connection.CreateCommand())
            {
                command.CommandText = DropAllSql;
                command.CommandTimeout = 300;
                await command.ExecuteNonQueryAsync();
            }

            var remaining = await ScalarAsync(connection, "SELECT CAST((SELECT COUNT(*) FROM sys.objects WHERE is_ms_shipped = 0 AND type IN (N'U', N'V', N'P', N'FN', N'IF', N'TF', N'SO', N'F')) + (SELECT COUNT(*) FROM sys.sequences) AS varchar(30))");
            if (remaining != "0")
            {
                return Fail(error, $"Silme tamamlandı ancak veritabanında {remaining} nesne kaldı.");
            }

            output.WriteLine($"'{databaseName}' veritabanındaki tüm nesneler (tablolar, __EFMigrationsHistory dahil) silindi.");
            output.WriteLine("Şemayı yeniden oluşturmak için migration'ları uygulayın.");
            return 0;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail(error, $"İşlem tamamlanamadı: {ex.GetBaseException().Message}");
        }
    }

    private const string DropAllSql = """
        BEGIN TRY
        BEGIN TRAN;
        DECLARE @sql nvarchar(max) = N'';
        SELECT @sql += N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(t.schema_id)) + N'.' + QUOTENAME(t.name) + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';' + CHAR(10)
        FROM sys.foreign_keys fk JOIN sys.tables t ON t.object_id = fk.parent_object_id
        WHERE t.is_ms_shipped = 0;
        EXEC sp_executesql @sql;

        SET @sql = N'';
        SELECT @sql += N'DROP VIEW ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';' + CHAR(10)
        FROM sys.views WHERE is_ms_shipped = 0;
        SELECT @sql += N'DROP PROCEDURE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';' + CHAR(10)
        FROM sys.procedures WHERE is_ms_shipped = 0;
        SELECT @sql += N'DROP FUNCTION ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';' + CHAR(10)
        FROM sys.objects WHERE is_ms_shipped = 0 AND type IN (N'FN', N'IF', N'TF');
        EXEC sp_executesql @sql;

        SET @sql = N'';
        SELECT @sql += N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N' SET (SYSTEM_VERSIONING = OFF);' + CHAR(10)
        FROM sys.tables WHERE is_ms_shipped = 0 AND temporal_type = 2;
        EXEC sp_executesql @sql;

        SET @sql = N'';
        SELECT @sql += N'DROP TABLE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';' + CHAR(10)
        FROM sys.tables WHERE is_ms_shipped = 0;
        SELECT @sql += N'DROP SEQUENCE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';' + CHAR(10)
        FROM sys.sequences;
        EXEC sp_executesql @sql;
        COMMIT TRAN;
        END TRY
        BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRAN;
        THROW;
        END CATCH
        """;

    private static async Task<string> ScalarAsync(System.Data.Common.DbConnection connection, string sql)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToString(await command.ExecuteScalarAsync(), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private static async Task<int> SeedReferenceDataAsync(AppDbContext db, bool dryRun, TextWriter output)
    {
        var result = await ReferenceData.ApplyAsync(db, dryRun);

        output.WriteLine(dryRun ? "Deneme çalıştırması (--dry-run): veritabanına hiçbir şey yazılmadı." : "Referans veri yüklendi.");
        var verb = dryRun ? "eklenecek" : "eklendi";
        foreach (var lesson in result.LessonsAdded)
        {
            output.WriteLine($"  Ders {verb}: {lesson}");
        }

        foreach (var (lesson, topic) in result.TopicsAdded)
        {
            output.WriteLine($"  Konu {verb}: {lesson} / {topic}");
        }

        output.WriteLine($"Dersler: {result.LessonsAdded.Count} {verb}, {result.LessonsExisting} zaten vardı.");
        output.WriteLine($"Konular: {result.TopicsAdded.Count} {verb}, {result.TopicsExisting} zaten vardı.");
        output.WriteLine("Var olan ders ve konulara dokunulmadı.");
        return 0;
    }

    private static async Task<string?> CheckDatabaseAsync(AppDbContext db)
    {
        if (!await db.Database.CanConnectAsync())
        {
            return "Veritabanına bağlanılamadı. ConnectionStrings__DefaultConnection değerini kontrol edin.";
        }

        var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
        if (pending.Count > 0)
        {
            return $"Veritabanı şeması güncel değil ({pending.Count} uygulanmamış migration var). Uygulama başlangıçta migration uygulamaz; önce migration'ları ayrı bir adımda uygulayın (dotnet ef database update).";
        }

        return null;
    }

    private static bool IsConfigurationArgument(string value) =>
        value.StartsWith("--", StringComparison.Ordinal) && value.Contains('=');

    private static int Fail(TextWriter error, string message, string? usage = null)
    {
        error.WriteLine($"Hata: {message}");
        if (usage is not null)
        {
            error.WriteLine($"Kullanım: dotnet LGSApp.Api.dll {usage}");
        }

        return 1;
    }

    private static int Help(TextWriter output)
    {
        output.WriteLine("LGSApp sunucu komutları");
        output.WriteLine();
        output.WriteLine("Kullanım:");
        output.WriteLine($"  dotnet LGSApp.Api.dll {ResetMudurPassword} <kullaniciAdi>");
        output.WriteLine($"  dotnet LGSApp.Api.dll {SeedReferenceData} [{DryRunOption}]");
        output.WriteLine($"  dotnet LGSApp.Api.dll {ResetDatabase} {DryRunOption}");
        output.WriteLine($"  dotnet LGSApp.Api.dll {ResetDatabase} {ConfirmOption} <veritabaniAdi>");
        output.WriteLine("  dotnet LGSApp.Api.dll --help");
        output.WriteLine();
        output.WriteLine($"{ResetMudurPassword}: Son çare olarak müdür hesabına tek seferlik yeni şifre üretir.");
        output.WriteLine("  - Hedef hesap müdür olmalıdır.");
        output.WriteLine("  - Şifre değiştirme zorunlu olur, hesap kilidi açılır, eski oturumlar düşer.");
        output.WriteLine("  - Tüm kurtarma kodları iptal edilir, bekleyen şifre sıfırlama talepleri kapatılır.");
        output.WriteLine("  - Banlı müdürde de çalışır ancak banı kaldırmaz.");
        output.WriteLine("  - Şifre yalnızca bir kez, standart çıktıya yazılır.");
        output.WriteLine();
        output.WriteLine($"{SeedReferenceData}: Ders ve konu referans verisini yükler (tekrar çalıştırılabilir).");
        output.WriteLine("  - Adı eşleşen ders/konular atlanır; var olan kayıtlar değiştirilmez veya silinmez.");
        output.WriteLine("  - Öğretmenin eklediği veya düzenlediği konulara dokunulmaz.");
        output.WriteLine($"  - {DryRunOption}: Neyin ekleneceğini listeler, veritabanına yazmaz.");
        output.WriteLine();
        output.WriteLine($"{ResetDatabase}: Veritabanındaki tüm nesneleri (tablolar, __EFMigrationsHistory dahil) siler.");
        output.WriteLine($"  - {ConfirmOption} değeri bağlantıdaki veritabanı adıyla birebir eşleşmezse hiçbir şey silinmez.");
        output.WriteLine($"  - {DryRunOption}: Veritabanı adını ve önemli tabloların satır sayılarını gösterir, silmez.");
        output.WriteLine("  - Sistem veritabanları (master, model, msdb, tempdb) reddedilir.");
        output.WriteLine("  - Migration kontrolü yapmaz; sonrasında migration'lar ayrıca uygulanmalıdır.");
        output.WriteLine();
        output.WriteLine("Ortak:");
        output.WriteLine("  - Veritabanı bağlantısı ConnectionStrings__DefaultConnection ile verilir.");
        output.WriteLine("  - Uygulanmamış migration varsa komut hata verir.");
        output.WriteLine("  - Çıkış kodu: 0 başarılı, 1 hata.");
        output.WriteLine("  - Ortam belirtilmezse Production sayılır; geliştirmede ASPNETCORE_ENVIRONMENT=Development ile çalıştırın.");
        return 0;
    }
}
