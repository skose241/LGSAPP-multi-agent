using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using LGSApp.Api.Authorization;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace LGSApp.Api.Extensions;

public static class AuthExtensions
{
    public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var jwt = configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();

        if (string.IsNullOrWhiteSpace(jwt.Key) || Encoding.UTF8.GetByteCount(jwt.Key) < 32)
        {
            throw new InvalidOperationException("Jwt:Key en az 32 byte olmalıdır.");
        }

        if (!environment.IsDevelopment() && jwt.Key.StartsWith("DEV-ONLY", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Geliştirme Jwt:Key değeri üretimde kullanılamaz. Jwt__Key ortam değişkenini tanımlayın.");
        }

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwt.Issuer,
                    ValidateAudience = true,
                    ValidAudience = jwt.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(1),
                    NameClaimType = ClaimTypes.Name,
                    RoleClaimType = ClaimTypes.Role
                };
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = ValidateTokenAsync
                };
            });

        services.AddSingleton<IAuthorizationHandler, MustChangePasswordHandler>();

        services.AddAuthorizationBuilder()
            .SetDefaultPolicy(new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .AddRequirements(new MustChangePasswordRequirement())
                .Build())
            .AddPolicy(Policies.Kullanici, p => p
                .RequireAuthenticatedUser()
                .AddRequirements(new MustChangePasswordRequirement())
                .RequireRole(Roles.Mudur, Roles.Ogretmen, Roles.Ogrenci))
            .AddPolicy(Policies.MudurOnly, p => p
                .RequireAuthenticatedUser()
                .AddRequirements(new MustChangePasswordRequirement())
                .RequireRole(Roles.Mudur))
            .AddPolicy(Policies.OgretmenOrMudur, p => p
                .RequireAuthenticatedUser()
                .AddRequirements(new MustChangePasswordRequirement())
                .RequireRole(Roles.Ogretmen, Roles.Mudur))
            .AddPolicy(Policies.OgrenciOnly, p => p
                .RequireAuthenticatedUser()
                .AddRequirements(new MustChangePasswordRequirement())
                .RequireRole(Roles.Ogrenci))
            .AddPolicy(Policies.AuthenticatedAllowPasswordChange, p => p
                .RequireAuthenticatedUser());

        return services;
    }

    private static async Task ValidateTokenAsync(TokenValidatedContext context)
    {
        var principal = context.Principal;
        var subject = principal?.FindFirstValue(JwtRegisteredClaimNames.Sub);
        var nameIdentifier = principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (principal is null
            || !int.TryParse(subject, NumberStyles.Integer, CultureInfo.InvariantCulture, out var userId)
            || (nameIdentifier is not null && !string.Equals(nameIdentifier, subject, StringComparison.Ordinal)))
        {
            context.Fail("Geçersiz kullanıcı.");
            return;
        }

        var tokenRoles = principal.Claims
            .Where(c => c.Type == ClaimTypes.Role || string.Equals(c.Type, "role", StringComparison.OrdinalIgnoreCase))
            .Select(c => c.Value)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (tokenRoles.Contains(Roles.Ai))
        {
            context.Fail("Sistem hesabı ile oturum açılamaz.");
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
        var row = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new
            {
                u.IsBanned,
                u.SecurityStamp,
                Roles = (from ur in db.UserRoles
                         join r in db.Roles on ur.RoleId equals r.Id
                         where ur.UserId == u.Id
                         select r.Name).ToList()
            })
            .FirstOrDefaultAsync(context.HttpContext.RequestAborted);
        if (row is null || row.IsBanned)
        {
            context.Fail("Hesap kullanılamaz.");
            return;
        }

        var databaseRoles = row.Roles
            .Where(r => r is not null)
            .Select(r => r!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (databaseRoles.Contains(Roles.Ai))
        {
            context.Fail("Sistem hesabı ile oturum açılamaz.");
            return;
        }

        if (!databaseRoles.SetEquals(tokenRoles))
        {
            context.Fail("Oturum geçersiz.");
            return;
        }

        var tokenStamp = principal.FindFirstValue(TokenService.SecurityStampClaim);
        if (string.IsNullOrEmpty(tokenStamp) || !string.Equals(tokenStamp, row.SecurityStamp, StringComparison.Ordinal))
        {
            context.Fail("Oturum geçersiz.");
        }
    }
}
