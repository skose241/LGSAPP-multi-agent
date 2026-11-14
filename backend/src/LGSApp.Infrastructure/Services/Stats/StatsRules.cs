namespace LGSApp.Infrastructure.Services.Stats;

public enum ParticipationStatus
{
    Empty = 0,
    Completed = 1,
    Partial = 2,
    Missed = 3,
    NotStarted = 4
}

public static class StatsRules
{
    public static double? SuccessRate(int answered, int correct) =>
        answered <= 0 ? null : Math.Round(correct * 100.0 / answered, 1, MidpointRounding.AwayFromZero);

    public static ParticipationStatus Classify(int totalQuestions, int answered, bool isClosed)
    {
        if (totalQuestions <= 0)
        {
            return ParticipationStatus.Empty;
        }

        if (answered >= totalQuestions)
        {
            return ParticipationStatus.Completed;
        }

        if (answered > 0)
        {
            return ParticipationStatus.Partial;
        }

        return isClosed ? ParticipationStatus.Missed : ParticipationStatus.NotStarted;
    }
}
