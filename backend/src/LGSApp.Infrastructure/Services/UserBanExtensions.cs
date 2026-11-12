using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace LGSApp.Infrastructure.Services;

public static class UserBanExtensions
{
    public static async Task<IdentityResult> SetBannedAsync(this UserManager<ApplicationUser> userManager, ApplicationUser user, bool banned)
    {
        if (banned && await userManager.IsInRoleAsync(user, Roles.Mudur))
        {
            return IdentityResult.Failed(new IdentityError { Code = SystemAccounts.MudurBanErrorCode, Description = SystemAccounts.MudurBanMessage });
        }

        user.IsBanned = banned;
        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            return result;
        }

        return await userManager.UpdateSecurityStampAsync(user);
    }
}
