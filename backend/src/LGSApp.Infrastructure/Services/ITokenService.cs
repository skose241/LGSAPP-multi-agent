using LGSApp.Domain.Entities;

namespace LGSApp.Infrastructure.Services;

public record TokenResult(string Token, DateTime ExpiresAtUtc);

public interface ITokenService
{
    TokenResult CreateToken(ApplicationUser user, IEnumerable<string> roles);
}
