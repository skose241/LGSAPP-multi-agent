using LGSApp.Infrastructure.Services.Stats;

namespace LGSApp.Tests.Stats;

public class StatsRulesTests
{
    [Fact]
    public void Success_rate_is_null_without_answers()
    {
        Assert.Null(StatsRules.SuccessRate(0, 0));
    }

    [Theory]
    [InlineData(10, 7, 70.0)]
    [InlineData(3, 1, 33.3)]
    [InlineData(3, 2, 66.7)]
    [InlineData(8, 8, 100.0)]
    [InlineData(5, 0, 0.0)]
    public void Success_rate_is_a_percentage_with_one_decimal(int answered, int correct, double expected)
    {
        Assert.Equal(expected, StatsRules.SuccessRate(answered, correct));
    }

    [Theory]
    [InlineData(0, 0, false, ParticipationStatus.Empty)]
    [InlineData(0, 0, true, ParticipationStatus.Empty)]
    [InlineData(5, 5, false, ParticipationStatus.Completed)]
    [InlineData(5, 5, true, ParticipationStatus.Completed)]
    [InlineData(5, 7, true, ParticipationStatus.Completed)]
    [InlineData(5, 2, false, ParticipationStatus.Partial)]
    [InlineData(5, 2, true, ParticipationStatus.Partial)]
    [InlineData(5, 0, false, ParticipationStatus.NotStarted)]
    [InlineData(5, 0, true, ParticipationStatus.Missed)]
    public void Assignment_participation_is_classified(int total, int answered, bool closed, ParticipationStatus expected)
    {
        Assert.Equal(expected, StatsRules.Classify(total, answered, closed));
    }
}
