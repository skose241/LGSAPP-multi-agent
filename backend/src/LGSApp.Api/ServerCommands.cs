using LGSApp.Infrastructure;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Api;

public static class ServerCommands
{
    public const string ResetMudurPassword = "reset-mudur-password";

    public static bool IsCommand(string[] args) =>
        args.Length > 0 && (args[0] is ResetMudurPassword or "--help" or "-h" or "help" or "/?");

    public static async Task<int> RunAsync(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        if (args[0] != ResetMudurPassword || (args.Length == 2 && args[1] is "--help" or "-h"))
        {
            return Help();
        }

        if (args.Length != 2)
        {
            return Fail("Kullanıcı adı belirtilmelidir.", true);
        }

        var userName = args[1];
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
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

            if (!await db.Database.CanConnectAsync())
            {
                return Fail("Veritabanına bağlanılamadı. ConnectionStrings__DefaultConnection değerini kontrol edin.");
            }

            var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
            if (pending.Count > 0)
            {
                return Fail($"Veritabanı şeması güncel değil ({pending.Count} uygulanmamış migration var). Önce migration'ları uygulayın (dotnet ef database update veya uygulamayı bir kez başlatın).");
            }

            var recovery = scope.ServiceProvider.GetRequiredService<MudurRecoveryService>();
            var outcome = await recovery.ResetByOperatorAsync(userName);
            if (!outcome.Succeeded)
            {
                return Fail(outcome.Message);
            }

            Console.Out.WriteLine($"Müdür '{userName.Trim()}' için şifre sıfırlandı.");
            Console.Out.WriteLine($"Tek seferlik şifre: {outcome.Password}");
            Console.Out.WriteLine("Bu şifre yalnızca bir kez gösterilir. İlk girişte değiştirilmesi zorunludur.");
            Console.Out.WriteLine("Tüm kurtarma kodları iptal edildi; ilk şifre değişikliğinde yeni kodlar verilecek.");
            Console.Out.WriteLine("Hesap kilidi kaldırıldı, eski oturumlar geçersiz kılındı, bekleyen şifre sıfırlama talepleri kapatıldı.");
            if (outcome.IsBanned)
            {
                Console.Out.WriteLine("UYARI: Hesap engelli (banlı) durumda; bu komut engeli kaldırmaz.");
            }

            return 0;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail($"İşlem tamamlanamadı: {ex.GetBaseException().Message}");
        }
    }

    private static int Fail(string message, bool showUsage = false)
    {
        Console.Error.WriteLine($"Hata: {message}");
        if (showUsage)
        {
            Console.Error.WriteLine($"Kullanım: dotnet LGSApp.Api.dll {ResetMudurPassword} <kullaniciAdi>");
        }

        return 1;
    }

    private static int Help()
    {
        Console.Out.WriteLine("LGSApp sunucu komutları");
        Console.Out.WriteLine();
        Console.Out.WriteLine("Kullanım:");
        Console.Out.WriteLine($"  dotnet LGSApp.Api.dll {ResetMudurPassword} <kullaniciAdi>");
        Console.Out.WriteLine("  dotnet LGSApp.Api.dll --help");
        Console.Out.WriteLine();
        Console.Out.WriteLine($"{ResetMudurPassword}: Son çare olarak müdür hesabına tek seferlik yeni şifre üretir.");
        Console.Out.WriteLine("  - Hedef hesap müdür olmalıdır.");
        Console.Out.WriteLine("  - Şifre değiştirme zorunlu olur, hesap kilidi açılır, eski oturumlar düşer.");
        Console.Out.WriteLine("  - Tüm kurtarma kodları iptal edilir, bekleyen şifre sıfırlama talepleri kapatılır.");
        Console.Out.WriteLine("  - Banlı müdürde de çalışır ancak banı kaldırmaz.");
        Console.Out.WriteLine("  - Şifre yalnızca bir kez, standart çıktıya yazılır.");
        Console.Out.WriteLine("  - Veritabanı bağlantısı ConnectionStrings__DefaultConnection ile verilir.");
        Console.Out.WriteLine("  - Çıkış kodu: 0 başarılı, 1 hata.");
        return 0;
    }
}
