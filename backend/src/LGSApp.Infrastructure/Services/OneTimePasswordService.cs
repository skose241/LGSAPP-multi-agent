using LGSApp.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace LGSApp.Infrastructure.Services;

public record OneTimePasswordResult(IdentityResult Result, string Password);

public class OneTimePasswordService
{
    private readonly UserManager<ApplicationUser> _userManager;

    public OneTimePasswordService(UserManager<ApplicationUser> userManager)
    {
        _userManager = userManager;
    }

    public async Task<OneTimePasswordResult> ResetAsync(ApplicationUser user, bool mustChangePassword)
    {
        var password = PasswordGenerator.Generate();
        user.MustChangePassword = mustChangePassword;

        var token = await _userManager.GeneratePasswordResetTokenAsync(user);
        var result = await _userManager.ResetPasswordAsync(user, token, password);
        if (!result.Succeeded)
        {
            return new OneTimePasswordResult(result, password);
        }

        result = await _userManager.UpdateSecurityStampAsync(user);
        if (!result.Succeeded)
        {
            return new OneTimePasswordResult(result, password);
        }

        await _userManager.SetLockoutEndDateAsync(user, null);
        await _userManager.ResetAccessFailedCountAsync(user);

        return new OneTimePasswordResult(IdentityResult.Success, password);
    }
}
