using System.Security.Claims;
using System.Threading.RateLimiting;
using LGSApp.Api.Options;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Extensions;

public static class RateLimitingExtensions
{
    public const string LoginPolicy = "login";
    public const string ForgotPasswordPolicy = "forgot-password";
    public const string CommentWritePolicy = "comment-write";
    public const string AnswerSubmitPolicy = "answer-submit";
    public const string ReportCreatePolicy = "report-create";

    public static IServiceCollection AddAppRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var settings = configuration.GetSection(RateLimitingOptions.SectionName).Get<RateLimitingOptions>() ?? new RateLimitingOptions();

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(LoginPolicy, context => IpPartition(context, settings.Login));
            options.AddPolicy(ForgotPasswordPolicy, context => IpPartition(context, settings.ForgotPassword));
            options.AddPolicy(CommentWritePolicy, context => UserPartition(context, CommentWritePolicy, settings.CommentWrite));
            options.AddPolicy(AnswerSubmitPolicy, context => UserPartition(context, AnswerSubmitPolicy, settings.AnswerSubmit));
            options.AddPolicy(ReportCreatePolicy, context => UserPartition(context, ReportCreatePolicy, settings.ReportCreate));
            options.OnRejected = async (context, cancellationToken) =>
            {
                var response = context.HttpContext.Response;
                response.StatusCode = StatusCodes.Status429TooManyRequests;
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture);
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

    private static RateLimitPartition<string> UserPartition(HttpContext context, string policy, RateLimitRule rule)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var key = userId is not null
            ? $"{policy}:user:{userId}"
            : $"{policy}:ip:{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}";
        var permits = Math.Max(1, rule.PermitLimit);
        var windowSeconds = Math.Max(1, rule.WindowSeconds);
        var period = TimeSpan.FromSeconds(Math.Max(1.0, (double)windowSeconds / permits));
        return RateLimitPartition.GetTokenBucketLimiter(key, _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = permits,
            TokensPerPeriod = 1,
            ReplenishmentPeriod = period,
            QueueLimit = 0,
            AutoReplenishment = true
        });
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
