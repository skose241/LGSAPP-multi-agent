using LGSApp.Api.Extensions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace LGSApp.Tests.Api;

public class ProductionGuardsTests
{
    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "LGSApp.Api";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static Dictionary<string, string?> ValidProduction() => new()
    {
        ["ConnectionStrings:DefaultConnection"] = "Server=tcp:sql.example.net,1433;Database=LGSApp;User ID=u;Password=p;Encrypt=True",
        ["Jwt:Key"] = "uretim-anahtari-0123456789-abcdefghijklmnopqrstuvwxyz",
        ["RecoveryCodes:Pepper"] = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48)),
        ["Storage:ConnectionString"] = "DefaultEndpointsProtocol=https;AccountName=a;AccountKey=Zm9v;EndpointSuffix=core.windows.net",
        ["Ai:Provider"] = "Gemini",
        ["RateLimiting:Login:PermitLimit"] = "10",
        ["Cors:AllowedOrigins:0"] = "https://okul.example.com"
    };

    private static ProductionGuardResult Run(Dictionary<string, string?> values, string environment = "Production") =>
        ProductionGuards.Evaluate(new ConfigurationBuilder().AddInMemoryCollection(values).Build(), new FakeEnvironment(environment));

    private static string DevelopmentPepper()
    {
        var configuration = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.Development.json"), optional: false)
            .Build();
        return configuration["RecoveryCodes:Pepper"]!;
    }

    [Fact]
    public void Clean_production_configuration_has_no_errors()
    {
        var result = Run(ValidProduction());

        Assert.Empty(result.Errors);
        Assert.Empty(result.Warnings);
    }

    [Fact]
    public void Development_environment_skips_all_guards()
    {
        var values = ValidProduction();
        values["Storage:ConnectionString"] = "UseDevelopmentStorage=true";
        values["ConnectionStrings:DefaultConnection"] = "Server=(localdb)\\MSSQLLocalDB;Database=x";
        values["RateLimiting:Login:PermitLimit"] = "10000";

        Assert.Empty(Run(values, "Development").Errors);
    }

    [Fact]
    public void Development_pepper_is_rejected_by_fingerprint()
    {
        var values = ValidProduction();
        values["RecoveryCodes:Pepper"] = DevelopmentPepper();

        var result = Run(values);

        Assert.Contains(result.Errors, e => e.Contains("RecoveryCodes:Pepper"));
    }

    [Fact]
    public void Development_storage_is_rejected()
    {
        var values = ValidProduction();
        values["Storage:ConnectionString"] = "UseDevelopmentStorage=true";

        Assert.Contains(Run(values).Errors, e => e.Contains("UseDevelopmentStorage"));
    }

    [Fact]
    public void Empty_storage_is_rejected()
    {
        var values = ValidProduction();
        values["Storage:ConnectionString"] = "";

        Assert.Contains(Run(values).Errors, e => e.Contains("Storage:ConnectionString"));
    }

    [Fact]
    public void Localdb_connection_is_rejected()
    {
        var values = ValidProduction();
        values["ConnectionStrings:DefaultConnection"] = "Server=(localdb)\\MSSQLLocalDB;Database=LGSApp";

        Assert.Contains(Run(values).Errors, e => e.Contains("localdb"));
    }

    [Fact]
    public void Rate_limit_above_ceiling_is_rejected_and_ceiling_is_allowed()
    {
        var values = ValidProduction();
        values["RateLimiting:BulkUserCreate:PermitLimit"] = "10000";
        Assert.Contains(Run(values).Errors, e => e.Contains("RateLimiting:BulkUserCreate:PermitLimit"));

        values["RateLimiting:BulkUserCreate:PermitLimit"] = ProductionGuards.RateLimitCeiling.ToString();
        Assert.Empty(Run(values).Errors);
    }

    [Fact]
    public void Existing_guards_are_reported()
    {
        var values = ValidProduction();
        values["Jwt:Key"] = "DEV-ONLY-placeholder-key-change-via-user-secrets-or-env-0123456789";
        values["Ai:Provider"] = "Fake";
        values["DevTime:OffsetMinutes"] = "30";

        var result = Run(values);

        Assert.Contains(result.Errors, e => e.Contains("Jwt:Key"));
        Assert.Contains(result.Errors, e => e.Contains("Fake"));
        Assert.Contains(result.Errors, e => e.Contains("DevTime"));
    }

    [Theory]
    [InlineData("Jwt:Key")]
    [InlineData("Bff:ProxyKey")]
    [InlineData("RecoveryCodes:Pepper")]
    [InlineData("Ai:Gemini:QuestionApiKey")]
    [InlineData("Ai:Gemini:SolutionApiKey")]
    [InlineData("Storage:ConnectionString")]
    [InlineData("ConnectionStrings:DefaultConnection")]
    public void Unresolved_key_vault_reference_is_rejected(string key)
    {
        var values = ValidProduction();
        values[key] = "  @microsoft.keyvault(SecretUri=https://kv.vault.azure.net/secrets/x/)";

        var result = Run(values);

        Assert.Contains(result.Errors, e => e.Contains(key) && e.Contains("Key Vault referansı çözülemedi"));
        Assert.Empty(Run(values, "Development").Errors);
    }

    [Fact]
    public void Jwt_key_that_is_a_key_vault_reference_fails_authentication_setup_in_any_environment()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "@Microsoft.KeyVault(VaultName=kv;SecretName=jwt-key-0123456789)"
        }).Build();

        var ex = Assert.Throws<InvalidOperationException>(() =>
            new ServiceCollection().AddJwtAuthentication(configuration, new FakeEnvironment("Development")));

        Assert.Contains("Key Vault referansı çözülemedi", ex.Message);
    }

    [Fact]
    public void Bff_proxy_key_that_is_a_key_vault_reference_fails_validation()
    {
        var message = LGSApp.Api.Options.BffOptions.Validate(new LGSApp.Api.Options.BffOptions
        {
            ProxyKey = "@Microsoft.KeyVault(VaultName=kv;SecretName=bff-proxy-key-0123)"
        });

        Assert.NotNull(message);
        Assert.Contains("Key Vault referansı çözülemedi", message);
    }

    [Theory]
    [InlineData("UseDevelopmentStorage = true")]
    [InlineData("usedevelopmentstorage=TRUE;DevelopmentStorageProxyUri=http://x")]
    [InlineData("UseDevelopmentStorage  =true")]
    public void Development_storage_regex_tolerates_spacing_and_case(string storage)
    {
        var values = ValidProduction();
        values["Storage:ConnectionString"] = storage;

        Assert.Contains(Run(values).Errors, e => e.Contains("UseDevelopmentStorage"));
    }

    [Fact]
    public void Localhost_cors_origin_only_warns()
    {
        var values = ValidProduction();
        values["Cors:AllowedOrigins:1"] = "http://localhost:3000";

        var result = Run(values);

        Assert.Empty(result.Errors);
        Assert.Single(result.Warnings);
    }

    [Fact]
    public void Fingerprint_is_stable_sha256_hex()
    {
        Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", ProductionGuards.Fingerprint("abc"));
    }

    [Fact]
    public async Task Pending_migrations_are_reported_and_applied_schema_is_clean()
    {
        var migrated = TestDatabase.NewName();
        var empty = TestDatabase.NewName();
        if (!await TestDatabase.TryCreateAsync(migrated, _ => Task.CompletedTask))
        {
            return;
        }

        try
        {
            Assert.Null(await ProductionGuards.FindPendingMigrationsAsync(Provider(migrated)));
            var message = await ProductionGuards.FindPendingMigrationsAsync(Provider(empty));
            Assert.NotNull(message);
            Assert.Contains("migration", message);
        }
        finally
        {
            await TestDatabase.DropAsync(migrated);
            await TestDatabase.DropAsync(empty);
        }
    }

    private static ServiceProvider Provider(string database) =>
        new ServiceCollection()
            .AddDbContext<LGSApp.Infrastructure.Persistence.AppDbContext>(o => o.UseSqlServer(TestDatabase.ConnectionString(database)))
            .BuildServiceProvider();
}
