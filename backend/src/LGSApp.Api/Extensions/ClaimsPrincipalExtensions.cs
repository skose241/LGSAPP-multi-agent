using System.Security.Claims;
using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Services.Common;

namespace LGSApp.Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    public static int GetUserId(this ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(value, out var id))
        {
            throw new InvalidOperationException("Oturumda geçerli bir kullanıcı kimliği bulunamadı.");
        }

        return id;
    }

    public static string GetRole(this ClaimsPrincipal user)
    {
        var role = user.FindAll(ClaimTypes.Role).Select(c => c.Value).FirstOrDefault(r => Roles.All.Contains(r));
        return role ?? throw new InvalidOperationException("Oturumda geçerli bir rol bulunamadı.");
    }

    public static Actor ToActor(this ClaimsPrincipal user) => new(user.GetUserId(), user.GetRole());
}
