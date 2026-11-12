using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace LGSApp.Infrastructure.Services;

public class RoleAwarePasswordValidator(IdentityErrorDescriber? describer = null) : PasswordValidator<ApplicationUser>(describer)
{
    public override async Task<IdentityResult> ValidateAsync(UserManager<ApplicationUser> manager, ApplicationUser user, string? password)
    {
        var result = await base.ValidateAsync(manager, user, password);
        if (password is null || password.Length >= MudurRules.PasswordMinLength || !await manager.IsInRoleAsync(user, Roles.Mudur))
        {
            return result;
        }

        var errors = result.Errors
            .Where(e => e.Code != nameof(IdentityErrorDescriber.PasswordTooShort))
            .Append(MudurTooShort(manager))
            .ToArray();
        return IdentityResult.Failed(errors);
    }

    private static IdentityError MudurTooShort(UserManager<ApplicationUser> manager) =>
        (manager.ErrorDescriber as TurkishIdentityErrorDescriber ?? new TurkishIdentityErrorDescriber()).MudurPasswordTooShort();
}
