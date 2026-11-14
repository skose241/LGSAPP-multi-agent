namespace LGSApp.Infrastructure.Services.Ai;

public sealed record AiStateFacts(bool SolutionExists, bool SolutionHidden, bool Disputed, bool Closed, bool UnreadableCached, bool UnreliableCached = false);

public static class AiAvailability
{
    public static DateTime? UnreadableWindowStart(DateTime nowUtc, int waitHours) =>
        waitHours <= 0 ? null : nowUtc.AddHours(-waitHours);

    public static DateTime? UnreliableWindowStart(DateTime nowUtc, int waitHours, DateTime? keyReviewedAt)
    {
        if (waitHours <= 0 || keyReviewedAt is null)
        {
            return null;
        }

        var since = nowUtc.AddHours(-waitHours);
        return keyReviewedAt.Value > since ? keyReviewedAt.Value : since;
    }

    public static bool IsClosed(bool enabled, bool isModerator, int personalLimit, int globalLimit) =>
        !enabled || globalLimit <= 0 || (!isModerator && personalLimit <= 0);

    public static AiSolutionStateInfo ResolveState(bool canSeeDiscussion, AiStateFacts facts)
    {
        if (!canSeeDiscussion)
        {
            return new AiSolutionStateInfo(AiSolutionStates.None, false);
        }

        if (facts.SolutionExists)
        {
            if (!facts.SolutionHidden)
            {
                return new AiSolutionStateInfo(AiSolutionStates.Available, false);
            }

            return new AiSolutionStateInfo(facts.Disputed ? AiSolutionStates.UnderReview : AiSolutionStates.Removed, false);
        }

        if (facts.Closed)
        {
            return new AiSolutionStateInfo(AiSolutionStates.Unavailable, false);
        }

        if (facts.UnreadableCached)
        {
            return new AiSolutionStateInfo(AiSolutionStates.Unreadable, false);
        }

        return facts.UnreliableCached
            ? new AiSolutionStateInfo(AiSolutionStates.Unavailable, false)
            : new AiSolutionStateInfo(AiSolutionStates.None, true);
    }
}

public static class GeminiQuotaReset
{
    private static readonly TimeZoneInfo Zone = Resolve();

    public static int SecondsUntilPacificMidnight(DateTime nowUtc)
    {
        var utc = DateTime.SpecifyKind(nowUtc, DateTimeKind.Utc);
        var local = TimeZoneInfo.ConvertTimeFromUtc(utc, Zone);
        var nextMidnight = DateTime.SpecifyKind(local.Date.AddDays(1), DateTimeKind.Unspecified);
        var targetUtc = TimeZoneInfo.ConvertTimeToUtc(nextMidnight, Zone);
        return Math.Max(1, (int)Math.Ceiling((targetUtc - utc).TotalSeconds));
    }

    private static TimeZoneInfo Resolve()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("America/Los_Angeles");
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Pacific Standard Time");
        }
    }
}
