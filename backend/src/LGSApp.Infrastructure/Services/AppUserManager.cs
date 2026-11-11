using LGSApp.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services;

public sealed class AppUserManager(
    IUserStore<ApplicationUser> store,
    IOptions<IdentityOptions> optionsAccessor,
    IPasswordHasher<ApplicationUser> passwordHasher,
    IEnumerable<IUserValidator<ApplicationUser>> userValidators,
    IEnumerable<IPasswordValidator<ApplicationUser>> passwordValidators,
    ILookupNormalizer keyNormalizer,
    IdentityErrorDescriber errors,
    IServiceProvider services,
    ILogger<UserManager<ApplicationUser>> logger)
    : UserManager<ApplicationUser>(store, optionsAccessor, passwordHasher, userValidators, passwordValidators, keyNormalizer, errors, services, logger)
{
    public override async Task<IdentityResult> AddToRoleAsync(ApplicationUser user, string role)
    {
        var result = await base.AddToRoleAsync(user, role);
        return result.Succeeded ? await RefreshStampAsync(user) : result;
    }

    public override async Task<IdentityResult> AddToRolesAsync(ApplicationUser user, IEnumerable<string> roles)
    {
        var result = await base.AddToRolesAsync(user, roles);
        return result.Succeeded ? await RefreshStampAsync(user) : result;
    }

    public override async Task<IdentityResult> RemoveFromRoleAsync(ApplicationUser user, string role)
    {
        var result = await base.RemoveFromRoleAsync(user, role);
        return result.Succeeded ? await RefreshStampAsync(user) : result;
    }

    public override async Task<IdentityResult> RemoveFromRolesAsync(ApplicationUser user, IEnumerable<string> roles)
    {
        var result = await base.RemoveFromRolesAsync(user, roles);
        return result.Succeeded ? await RefreshStampAsync(user) : result;
    }

    private async Task<IdentityResult> RefreshStampAsync(ApplicationUser user)
    {
        if (!SupportsUserSecurityStamp)
        {
            return IdentityResult.Success;
        }

        return await UpdateSecurityStampAsync(user);
    }
}
