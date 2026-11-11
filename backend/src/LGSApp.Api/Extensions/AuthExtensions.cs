using System.Globalization;
using System.Security.Claims;
using System.Text;
using LGSApp.Api.Authorization;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services;
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
                    OnTokenValidated = async context =>
                    {
                        var idValue = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                        if (!int.TryParse(idValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out var userId))
                        {
                            context.Fail("Geçersiz kullanıcı.");
                            return;
                        }

                        if (context.Principal?.IsInRole(Roles.Ai) == true)
                        {
                            context.Fail("Sistem hesabı ile oturum açılamaz.");
                            return;
                        }

                        var tokenStamp = context.Principal?.FindFirstValue(TokenService.SecurityStampClaim);
                        var userManager = context.HttpContext.RequestServices.GetRequiredService<UserManager<ApplicationUser>>();
                        var user = await userManager.FindByIdAsync(userId.ToString(CultureInfo.InvariantCulture));
                        if (user is null || user.IsBanned)
                        {
                            context.Fail("Hesap kullanılamaz.");
                            return;
                        }

                        if (string.IsNullOrEmpty(tokenStamp) || !string.Equals(tokenStamp, user.SecurityStamp, StringComparison.Ordinal))
                        {
                            context.Fail("Oturum geçersiz.");
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
}
