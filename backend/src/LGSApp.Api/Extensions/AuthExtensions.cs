using System.Security.Claims;
using System.Text;
using LGSApp.Api.Authorization;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;

namespace LGSApp.Api.Extensions;

public static class AuthExtensions
{
    public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var jwt = configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();

        if (string.IsNullOrWhiteSpace(jwt.Key) || Encoding.UTF8.GetByteCount(jwt.Key) < 32)
        {
            throw new InvalidOperationException("Jwt:Key en az 32 byte olmalidir.");
        }

        if (!environment.IsDevelopment() && jwt.Key.StartsWith("DEV-ONLY", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Gelistirme Jwt:Key degeri uretimde kullanilamaz. Jwt__Key ortam degiskenini tanimlayin.");
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
                    OnTokenValidated = async context =>
                    {
                        var idValue = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                        if (!int.TryParse(idValue, out var userId))
                        {
                            context.Fail("Gecersiz kullanici.");
                            return;
                        }

                        var userManager = context.HttpContext.RequestServices.GetRequiredService<UserManager<ApplicationUser>>();
                        var user = await userManager.FindByIdAsync(userId.ToString());
                        if (user is null || user.IsBanned)
                        {
                            context.Fail("Hesap kullanilamaz.");
                        }
                    }
                };
            });

        services.AddSingleton<IAuthorizationHandler, MustChangePasswordHandler>();

        services.AddAuthorizationBuilder()
            .SetDefaultPolicy(new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .AddRequirements(new MustChangePasswordRequirement())
                .Build())
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
            .AddPolicy(Policies.AiService, p => p
                .RequireAuthenticatedUser()
                .AddRequirements(new MustChangePasswordRequirement())
                .RequireRole(Roles.Ai))
            .AddPolicy(Policies.AuthenticatedAllowPasswordChange, p => p
                .RequireAuthenticatedUser());

        return services;
    }
}
