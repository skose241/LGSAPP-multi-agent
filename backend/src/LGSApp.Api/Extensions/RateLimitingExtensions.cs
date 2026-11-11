using System.Threading.RateLimiting;
using LGSApp.Api.Options;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Extensions;

public static class RateLimitingExtensions
{
    public const string LoginPolicy = "login";
    public const string ForgotPasswordPolicy = "forgot-password";

    public static IServiceCollection AddAppRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var settings = configuration.GetSection(RateLimitingOptions.SectionName).Get<RateLimitingOptions>() ?? new RateLimitingOptions();

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(LoginPolicy, context => IpPartition(context, settings.Login));
            options.AddPolicy(ForgotPasswordPolicy, context => IpPartition(context, settings.ForgotPassword));
            options.OnRejected = async (context, cancellationToken) =>
            {
                var response = context.HttpContext.Response;
                response.StatusCode = StatusCodes.Status429TooManyRequests;
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();
                }

                var problemDetails = context.HttpContext.RequestServices.GetRequiredService<IProblemDetailsService>();
                await problemDetails.WriteAsync(new ProblemDetailsContext
                {
                    HttpContext = context.HttpContext,
                    ProblemDetails = new ProblemDetails
                    {
                        Type = "https://tools.ietf.org/html/rfc6585#section-4",
                        Status = StatusCodes.Status429TooManyRequests,
                        Title = "Çok fazla istek gönderildi.",
                        Detail = "Lütfen bir süre bekleyip tekrar deneyin."
                    }
                });
            };
        });

        return services;
    }

    private static RateLimitPartition<string> IpPartition(HttpContext context, RateLimitRule rule)
    {
        var key = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = Math.Max(1, rule.PermitLimit),
            Window = TimeSpan.FromSeconds(Math.Max(1, rule.WindowSeconds)),
            QueueLimit = 0,
            AutoReplenishment = true
        });
    }
}
