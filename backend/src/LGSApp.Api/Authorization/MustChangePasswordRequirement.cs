using LGSApp.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;

namespace LGSApp.Api.Authorization;

public class MustChangePasswordRequirement : IAuthorizationRequirement
{
}

public class MustChangePasswordHandler : AuthorizationHandler<MustChangePasswordRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, MustChangePasswordRequirement requirement)
    {
        var claim = context.User.FindFirst(TokenService.MustChangePasswordClaim)?.Value;
        if (!string.Equals(claim, "true", StringComparison.OrdinalIgnoreCase))
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
