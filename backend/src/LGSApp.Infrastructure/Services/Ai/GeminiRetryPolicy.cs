using LGSApp.Domain.Entities;

namespace LGSApp.Infrastructure.Services.Ai;

public readonly record struct RetryDecision(bool Retry, TimeSpan Delay)
{
    public static RetryDecision Stop => new(false, TimeSpan.Zero);
}

public static class GeminiRetryPolicy
{
    public static readonly TimeSpan FirstBackoff = TimeSpan.FromSeconds(2);
    public static readonly TimeSpan SecondBackoff = TimeSpan.FromSeconds(6);
    public static readonly TimeSpan MinimumAttemptWindow = TimeSpan.FromSeconds(1);

    public static RetryDecision Decide(
        AiErrorKind kind,
        TimeSpan? retryDelay,
        int attempt,
        int maxAttempts,
        TimeSpan max429Wait,
        TimeSpan? rateLimitFallback,
        TimeSpan remainingBudget,
        double jitter)
    {
        if (attempt >= maxAttempts)
        {
            return RetryDecision.Stop;
        }

        jitter = Math.Clamp(jitter, 0, 1);

        TimeSpan wait;
        switch (kind)
        {
            case AiErrorKind.RateLimited:
                var baseDelay = retryDelay ?? rateLimitFallback;
                if (baseDelay is null)
                {
                    return RetryDecision.Stop;
                }

                wait = baseDelay.Value * (1.10 + 0.10 * jitter);
                if (wait > max429Wait)
                {
                    return RetryDecision.Stop;
                }

                break;
            case AiErrorKind.Unavailable:
            case AiErrorKind.Timeout:
                wait = (attempt <= 1 ? FirstBackoff : SecondBackoff) * (1.0 + 0.25 * jitter);
                break;
            default:
                return RetryDecision.Stop;
        }

        return remainingBudget - wait >= MinimumAttemptWindow
            ? new RetryDecision(true, wait)
            : RetryDecision.Stop;
    }
}
