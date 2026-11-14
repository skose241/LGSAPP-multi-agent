using LGSApp.Infrastructure.Services.Ai;

namespace LGSApp.Tests.Ai;

public class AiAvailabilityTests
{
    [Theory]
    [InlineData(true, false, 5, 150, false)]
    [InlineData(false, false, 5, 150, true)]
    [InlineData(true, false, 0, 150, true)]
    [InlineData(true, true, 0, 150, false)]
    [InlineData(true, true, 0, 0, true)]
    [InlineData(true, false, 5, 0, true)]
    [InlineData(true, false, 5, -1, true)]
    public void Closed_rules(bool enabled, bool moderator, int personal, int global, bool expected) =>
        Assert.Equal(expected, AiAvailability.IsClosed(enabled, moderator, personal, global));

    [Fact]
    public void Unreadable_cache_gives_unreadable_state_and_blocks_request()
    {
        var state = AiAvailability.ResolveState(true, new AiStateFacts(false, false, false, false, true));

        Assert.Equal(AiSolutionStates.Unreadable, state.State);
        Assert.False(state.CanRequest);
    }

    [Fact]
    public void No_discussion_access_is_none()
    {
        var state = AiAvailability.ResolveState(false, new AiStateFacts(false, false, false, true, true));

        Assert.Equal(AiSolutionStates.None, state.State);
        Assert.False(state.CanRequest);
    }

    [Fact]
    public void Closed_without_solution_is_unavailable()
    {
        var state = AiAvailability.ResolveState(true, new AiStateFacts(false, false, false, true, true));

        Assert.Equal(AiSolutionStates.Unavailable, state.State);
        Assert.False(state.CanRequest);
    }

    [Fact]
    public void Visible_solution_stays_available_even_when_closed()
    {
        var state = AiAvailability.ResolveState(true, new AiStateFacts(true, false, false, true, false));

        Assert.Equal(AiSolutionStates.Available, state.State);
        Assert.False(state.CanRequest);
    }

    [Theory]
    [InlineData(true, AiSolutionStates.UnderReview)]
    [InlineData(false, AiSolutionStates.Removed)]
    public void Hidden_solution_state(bool disputed, string expected)
    {
        var state = AiAvailability.ResolveState(true, new AiStateFacts(true, true, disputed, true, false));

        Assert.Equal(expected, state.State);
        Assert.False(state.CanRequest);
    }

    [Fact]
    public void Open_without_solution_can_request()
    {
        var state = AiAvailability.ResolveState(true, new AiStateFacts(false, false, false, false, false));

        Assert.Equal(AiSolutionStates.None, state.State);
        Assert.True(state.CanRequest);
    }
}

public class GeminiQuotaResetTests
{
    [Theory]
    [InlineData("2026-11-14T07:59:00Z", 60)]
    [InlineData("2026-11-14T08:00:00Z", 86400)]
    [InlineData("2026-07-14T06:59:00Z", 60)]
    [InlineData("2026-11-14T00:00:00Z", 8 * 3600)]
    public void Counts_seconds_to_pacific_midnight(string now, int expected)
    {
        var utc = DateTime.Parse(now, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal);

        Assert.Equal(expected, GeminiQuotaReset.SecondsUntilPacificMidnight(utc));
    }
}

public class AiPromptsLineEndingTests
{
    [Fact]
    public void Prompts_use_lf_only()
    {
        var solve = AiPrompts.SolveUser(new AiSolvePromptData("Matematik", "Konu", "Soru\r\nmetni\rdevam", "a", "b", "c", "d", false, 2));
        var question = AiPrompts.QuestionUser(new AiQuestionPromptData("Matematik", "Konu", 1, ["önceki\r\nsoru"]));

        Assert.DoesNotContain('\r', solve);
        Assert.DoesNotContain('\r', question);
        Assert.Contains('\n', solve);
    }

    [Fact]
    public void Lf_normalizes()
    {
        Assert.Equal("a\nb\nc", AiPrompts.Lf("a\r\nb\rc"));
    }
}
