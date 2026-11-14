namespace LGSApp.Infrastructure.Services.Ai;

public sealed record AiStateFacts(bool SolutionExists, bool SolutionHidden, bool Disputed, bool Closed, bool UnreadableCached);

public static class AiAvailability
{
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

        return facts.UnreadableCached
            ? new AiSolutionStateInfo(AiSolutionStates.Unreadable, false)
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
