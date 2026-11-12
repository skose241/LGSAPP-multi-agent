using LGSApp.Domain.Constants;
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

    public async Task<IdentityResult?> GuardAsync(ApplicationUser user, bool allowMudur = false)
    {
        if (await _userManager.IsInRoleAsync(user, Roles.Ai))
        {
            return IdentityResult.Failed(new IdentityError { Description = SystemAccounts.ManagedMessage });
        }

        if (!allowMudur && await _userManager.IsInRoleAsync(user, Roles.Mudur))
        {
            return IdentityResult.Failed(new IdentityError { Code = MudurRules.PasswordResetForbiddenCode, Description = MudurRules.PasswordResetForbiddenMessage });
        }

        return null;
    }

    public async Task<OneTimePasswordResult> ResetAsync(ApplicationUser user, bool mustChangePassword, bool allowMudur = false)
    {
        var password = PasswordGenerator.Generate();
        var denied = await GuardAsync(user, allowMudur);
        if (denied is not null)
        {
            return new OneTimePasswordResult(denied, string.Empty);
        }

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
