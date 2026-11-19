using LGSApp.Infrastructure;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Api;

public static class ServerCommands
{
    public const string ResetMudurPassword = "reset-mudur-password";
    public const string SeedReferenceData = "seed-reference-data";
    public const string DryRunOption = "--dry-run";

    public static bool IsCommand(string[] args) =>
        args.Length > 0 && (args[0] is ResetMudurPassword or SeedReferenceData or "--help" or "-h" or "help" or "/?");

    public static Task<int> RunAsync(string[] args) => RunAsync(args, Console.Out, Console.Error);

    public static async Task<int> RunAsync(string[] args, TextWriter output, TextWriter error)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        var positional = args.Skip(1).Where(a => !IsConfigurationArgument(a)).ToList();
        if (args[0] is not (ResetMudurPassword or SeedReferenceData) || positional.Any(a => a is "--help" or "-h"))
        {
            return Help(output);
        }

        string? userName = null;
        var dryRun = false;
        if (args[0] == ResetMudurPassword)
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
            Args = args.Where(a => a != DryRunOption).ToArray(),
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
        output.WriteLine("Ortak:");
        output.WriteLine("  - Veritabanı bağlantısı ConnectionStrings__DefaultConnection ile verilir.");
        output.WriteLine("  - Uygulanmamış migration varsa komut hata verir.");
        output.WriteLine("  - Çıkış kodu: 0 başarılı, 1 hata.");
        output.WriteLine("  - Ortam belirtilmezse Production sayılır; geliştirmede ASPNETCORE_ENVIRONMENT=Development ile çalıştırın.");
        return 0;
    }
}
