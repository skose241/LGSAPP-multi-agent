using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Options;

public class RefreshTokenOptions
{
    public const string SectionName = "Jwt:Refresh";

    public int SlidingDays { get; set; } = 30;
    public int FamilyMaxDays { get; set; } = 90;
    public int MudurAbsoluteHours { get; set; } = 12;
    public int ReuseGraceSeconds { get; set; } = 30;
    public int CleanupRetentionDays { get; set; } = 7;
    public int MaxGraceSiblings { get; set; } = 3;
    public bool CleanupEnabled { get; set; } = true;
    public int CleanupIntervalMinutes { get; set; } = 360;

    public static string? Validate(RefreshTokenOptions o)
    {
        if (o.SlidingDays is < 1 or > 365)
        {
            return "Jwt:Refresh:SlidingDays 1 ile 365 arasında olmalıdır.";
        }

        if (o.FamilyMaxDays < o.SlidingDays || o.FamilyMaxDays > 365)
        {
            return "Jwt:Refresh:FamilyMaxDays, SlidingDays değerinden küçük olamaz ve en fazla 365 olabilir.";
        }

        if (o.MudurAbsoluteHours is < 1 or > 168)
        {
            return "Jwt:Refresh:MudurAbsoluteHours 1 ile 168 arasında olmalıdır.";
        }

        if (o.ReuseGraceSeconds is < 0 or > 300)
        {
            return "Jwt:Refresh:ReuseGraceSeconds 0 ile 300 arasında olmalıdır.";
        }

        if (o.CleanupRetentionDays is < 1 or > 365)
        {
            return "Jwt:Refresh:CleanupRetentionDays 1 ile 365 arasında olmalıdır.";
        }

        if (o.MaxGraceSiblings is < 0 or > 10)
        {
            return "Jwt:Refresh:MaxGraceSiblings 0 ile 10 arasında olmalıdır.";
        }

        if (o.CleanupIntervalMinutes is < 1 or > 10080)
        {
            return "Jwt:Refresh:CleanupIntervalMinutes 1 ile 10080 arasında olmalıdır.";
        }

        return null;
    }
}

public sealed class RefreshTokenOptionsValidator : IValidateOptions<RefreshTokenOptions>
{
    public ValidateOptionsResult Validate(string? name, RefreshTokenOptions options) =>
        RefreshTokenOptions.Validate(options) is { } message ? ValidateOptionsResult.Fail(message) : ValidateOptionsResult.Success;
}

public static class RefreshTokenOptionsExtensions
{
    public static IServiceCollection AddRefreshTokenOptions(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<IValidateOptions<RefreshTokenOptions>, RefreshTokenOptionsValidator>();
        services.AddOptions<RefreshTokenOptions>().Bind(configuration.GetSection(RefreshTokenOptions.SectionName)).ValidateOnStart();
        return services;
    }
}
