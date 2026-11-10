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
            logger.LogInformation("Seed:AdminUserName veya Seed:AdminPassword tanimli degil, mudur hesabi olusturulmadi.");
            return;
        }

        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        if (await userManager.FindByNameAsync(options.AdminUserName) is not null)
        {
            return;
        }

        var admin = new ApplicationUser
        {
            UserName = options.AdminUserName,
            Email = options.AdminEmail,
            EmailConfirmed = !string.IsNullOrWhiteSpace(options.AdminEmail),
            FirstName = options.AdminFirstName,
            LastName = options.AdminLastName,
            MustChangePassword = false,
            CreatedAt = DateTime.UtcNow
        };

        var created = await userManager.CreateAsync(admin, options.AdminPassword);
        if (!created.Succeeded)
        {
            logger.LogError("Mudur hesabi olusturulamadi: {Errors}", string.Join("; ", created.Errors.Select(e => e.Description)));
            return;
        }

        await userManager.AddToRoleAsync(admin, Roles.Mudur);
        logger.LogInformation("Ilk mudur hesabi olusturuldu: {UserName}", options.AdminUserName);
    }
}
