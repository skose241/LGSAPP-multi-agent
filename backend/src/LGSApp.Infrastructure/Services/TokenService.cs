using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace LGSApp.Infrastructure.Services;

public class TokenService : ITokenService
{
    public const string MustChangePasswordClaim = "must_change_password";

    private readonly JwtOptions _options;

    public TokenService(IOptions<JwtOptions> options)
    {
        _options = options.Value;
    }

    public TokenResult CreateToken(ApplicationUser user, IEnumerable<string> roles)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.UserName ?? string.Empty),
            new(MustChangePasswordClaim, user.MustChangePassword ? "true" : "false")
        };
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Key));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expires = DateTime.UtcNow.AddMinutes(_options.ExpiryMinutes);

        var token = new JwtSecurityToken(
            _options.Issuer,
            _options.Audience,
            claims,
            DateTime.UtcNow,
            expires,
            credentials);

        return new TokenResult(new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
