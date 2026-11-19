using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace LGSApp.Infrastructure.Persistence;

public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public const string ConnectionVariable = "ConnectionStrings__DefaultConnection";
    public const string UserSecretsId = "lgsapp-api-dev";

    private const string MissingConnection =
        "Server=tcp:connection-not-provided.invalid,1433;Database=LGSApp;Connect Timeout=5;Application Name=ConnectionStrings__DefaultConnection-veya---connection-verilmedi";

    public AppDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
            ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
            ?? "Development";
        var development = string.Equals(environment, "Development", StringComparison.OrdinalIgnoreCase);

        var connection = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connection) && development)
        {
            connection = ReadDevelopmentConnection(environment);
        }

        if (string.IsNullOrWhiteSpace(connection))
        {
            Console.Error.WriteLine($"{environment} ortamında {ConnectionVariable} tanımlı değil; bağlantı dizesi ortam değişkeniyle ya da komutun --connection seçeneğiyle verilmelidir.");
            connection = MissingConnection;
        }

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(connection)
            .Options;
        return new AppDbContext(options);
    }

    private static string? ReadDevelopmentConnection(string environment)
    {
        var builder = new ConfigurationBuilder();
        for (var dir = new DirectoryInfo(Directory.GetCurrentDirectory()); dir is not null; dir = dir.Parent)
        {
            var apiDir = Path.Combine(dir.FullName, "backend", "src", "LGSApp.Api");
            if (!Directory.Exists(apiDir)) apiDir = Path.Combine(dir.FullName, "src", "LGSApp.Api");
            if (!File.Exists(Path.Combine(apiDir, "appsettings.json"))) continue;

            builder.SetBasePath(apiDir)
                .AddJsonFile("appsettings.json", optional: true)
                .AddJsonFile($"appsettings.{environment}.json", optional: true);
            break;
        }

        return builder
            .AddUserSecrets(UserSecretsId)
            .Build()
            .GetConnectionString("DefaultConnection");
    }
}
