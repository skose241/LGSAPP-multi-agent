using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Persistence;

public static class DbSeeder
{
    public static async Task SeedAdminAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var options = scope.ServiceProvider.GetRequiredService<IOptions<SeedOptions>>().Value;
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbSeeder");

        if (!options.Enabled)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(options.AdminUserName) || string.IsNullOrWhiteSpace(options.AdminPassword))
        {
            logger.LogInformation("Seed:AdminUserName veya Seed:AdminPassword tanımlı değil, müdür hesabı oluşturulmadı.");
            return;
        }

        var userName = options.AdminUserName.Trim();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        if (await userManager.FindByNameAsync(userName) is not null)
        {
            return;
        }

        var admin = new ApplicationUser
        {
            UserName = userName,
            FirstName = options.AdminFirstName,
            LastName = options.AdminLastName,
            MustChangePassword = false,
            CreatedAt = DateTime.UtcNow
        };

        var created = await userManager.CreateAsync(admin, options.AdminPassword);
        if (!created.Succeeded)
        {
            logger.LogError("Müdür hesabı oluşturulamadı: {Errors}", string.Join("; ", created.Errors.Select(e => e.Description)));
            return;
        }

        var roleResult = await userManager.AddToRoleAsync(admin, Roles.Mudur);
        if (!roleResult.Succeeded)
        {
            logger.LogError("Müdür rolü atanamadı, hesap geri alınıyor: {Errors}", string.Join("; ", roleResult.Errors.Select(e => e.Description)));
            await userManager.DeleteAsync(admin);
            return;
        }

        logger.LogInformation("İlk müdür hesabı oluşturuldu: {UserName}", userName);
    }
}
