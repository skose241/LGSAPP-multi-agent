using LGSApp.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace LGSApp.Infrastructure.Services;

public static class UserBanExtensions
{
    public static async Task<IdentityResult> SetBannedAsync(this UserManager<ApplicationUser> userManager, ApplicationUser user, bool banned)
    {
        user.IsBanned = banned;
        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            return result;
        }

        return await userManager.UpdateSecurityStampAsync(user);
    }
}
