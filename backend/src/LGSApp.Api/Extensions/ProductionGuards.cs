using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Api.Extensions;

public sealed record ProductionGuardResult(IReadOnlyList<string> Errors, IReadOnlyList<string> Warnings);

public static partial class ProductionGuards
{
    private static readonly string[] SecretKeys =
    [
        "Jwt:Key",
        "Bff:ProxyKey",
        "RecoveryCodes:Pepper",
        "Ai:Gemini:QuestionApiKey",
        "Ai:Gemini:SolutionApiKey",
        "Storage:ConnectionString",
        "ConnectionStrings:DefaultConnection"
    ];

    [GeneratedRegex(@"UseDevelopmentStorage\s*=\s*true", RegexOptions.IgnoreCase)]
    private static partial Regex DevelopmentStorageRegex();

    public static bool IsUnresolvedKeyVaultReference(string? value) =>
        value is not null && value.TrimStart().StartsWith("@Microsoft.KeyVault(", StringComparison.OrdinalIgnoreCase);

    public const int RateLimitCeiling = 1000;

    private const string DevelopmentPepperFingerprint = "7fad99ba3fb6ae5a70a03f0bdc9a67bcf6f9efef43314ab9fe24f2679cb9d80b";

    public static ProductionGuardResult Evaluate(IConfiguration configuration, IHostEnvironment environment)
    {
        var errors = new List<string>();
        var warnings = new List<string>();
        if (environment.IsDevelopment())
        {
            return new ProductionGuardResult(errors, warnings);
        }

        if (configuration.GetValue<int>("DevTime:OffsetMinutes") != 0)
        {
            errors.Add("DevTime:OffsetMinutes yalnızca Development ortamında kullanılabilir.");
        }

        foreach (var key in SecretKeys)
        {
            if (IsUnresolvedKeyVaultReference(configuration[key]))
            {
                errors.Add($"{key} Key Vault referansı çözülemedi; managed identity rolü ve sır adını kontrol edin.");
            }
        }

        var jwtKey = configuration["Jwt:Key"];
        if (!string.IsNullOrEmpty(jwtKey) && jwtKey.StartsWith("DEV-ONLY", StringComparison.Ordinal))
        {
            errors.Add("Geliştirme Jwt:Key değeri üretimde kullanılamaz. Jwt__Key ortam değişkenini tanımlayın.");
        }

        var provider = configuration["Ai:Provider"];
        var legacyFake = configuration.GetValue<bool>(AiOptions.LegacyFakeFlagName);
        if (string.Equals(provider?.Trim(), "Fake", StringComparison.OrdinalIgnoreCase) || (legacyFake && string.IsNullOrWhiteSpace(provider)))
        {
            errors.Add("Ai:Provider 'Fake' yalnızca Development ortamında kullanılabilir.");
        }

        var pepper = configuration["RecoveryCodes:Pepper"];
        if (!string.IsNullOrWhiteSpace(pepper) && Fingerprint(pepper.Trim()) == DevelopmentPepperFingerprint)
        {
            errors.Add("Geliştirme RecoveryCodes:Pepper değeri üretimde kullanılamaz. RecoveryCodes__Pepper ortam değişkenine yeni bir değer verin (örnek: 'openssl rand -base64 48').");
        }

        var storage = configuration["Storage:ConnectionString"];
        if (string.IsNullOrWhiteSpace(storage))
        {
            errors.Add("Storage:ConnectionString tanımlı değil. Üretimde Storage__ConnectionString ortam değişkeni verilmelidir.");
        }
        else if (DevelopmentStorageRegex().IsMatch(storage))
        {
            errors.Add("Storage:ConnectionString geliştirme depolamasını (UseDevelopmentStorage=true) gösteriyor; üretimde kullanılamaz.");
        }

        var database = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(database))
        {
            errors.Add("ConnectionStrings:DefaultConnection tanımlı değil.");
        }
        else if (database.Contains("(localdb)", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("ConnectionStrings:DefaultConnection LocalDB'yi (localdb) gösteriyor; üretimde kullanılamaz. ConnectionStrings__DefaultConnection ortam değişkenini tanımlayın.");
        }

        foreach (var rule in configuration.GetSection("RateLimiting").GetChildren())
        {
            if (int.TryParse(rule["PermitLimit"], out var limit) && limit > RateLimitCeiling)
            {
                errors.Add($"RateLimiting:{rule.Key}:PermitLimit değeri {limit}; üretimde en fazla {RateLimitCeiling} olabilir.");
            }
        }

        var origins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        var local = origins.Where(IsLocalOrigin).ToList();
        if (local.Count > 0)
        {
            warnings.Add($"Cors:AllowedOrigins içinde yerel adres var: {string.Join(", ", local)}. Üretimde kaldırılmalıdır.");
        }

        return new ProductionGuardResult(errors, warnings);
    }

    public static async Task<string?> FindPendingMigrationsAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var pending = (await db.Database.GetPendingMigrationsAsync(cancellationToken)).ToList();
        return pending.Count == 0
            ? null
            : $"Veritabanı şeması güncel değil ({pending.Count} uygulanmamış migration: {string.Join(", ", pending)}). Migration'lar uygulama kodundan önce ayrı bir adımda uygulanmalıdır (dotnet ef database update veya migration betiği).";
    }

    public static string Fingerprint(string value) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static bool IsLocalOrigin(string origin) =>
        Uri.TryCreate(origin, UriKind.Absolute, out var uri)
            ? uri.IsLoopback || uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            : origin.Contains("localhost", StringComparison.OrdinalIgnoreCase);
}
