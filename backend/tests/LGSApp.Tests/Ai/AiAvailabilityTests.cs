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
    public void Unreliable_cache_gives_unavailable_state_and_blocks_request()
    {
        var state = AiAvailability.ResolveState(true, new AiStateFacts(false, false, false, false, false, true));

        Assert.Equal(AiSolutionStates.Unavailable, state.State);
        Assert.False(state.CanRequest);
    }

    [Fact]
    public void Unreadable_wins_over_unreliable_and_closed_wins_over_both()
    {
        Assert.Equal(AiSolutionStates.Unreadable, AiAvailability.ResolveState(true, new AiStateFacts(false, false, false, false, true, true)).State);
        Assert.Equal(AiSolutionStates.Unavailable, AiAvailability.ResolveState(true, new AiStateFacts(false, false, false, true, true, true)).State);
    }

    [Fact]
    public void Visible_solution_ignores_unreliable_cache()
    {
        var state = AiAvailability.ResolveState(true, new AiStateFacts(true, false, false, false, false, true));

        Assert.Equal(AiSolutionStates.Available, state.State);
    }

    [Fact]
    public void Unreliable_window_is_null_for_blind_questions_or_disabled_wait()
    {
        var now = new DateTime(2026, 11, 14, 12, 0, 0, DateTimeKind.Utc);

        Assert.Null(AiAvailability.UnreliableWindowStart(now, 24, null));
        Assert.Null(AiAvailability.UnreliableWindowStart(now, 0, now.AddHours(-1)));
        Assert.Null(AiAvailability.UnreadableWindowStart(now, 0));
    }

    [Fact]
    public void Unreliable_window_starts_at_the_later_of_wait_start_and_key_review()
    {
        var now = new DateTime(2026, 11, 14, 12, 0, 0, DateTimeKind.Utc);

        Assert.Equal(now.AddHours(-2), AiAvailability.UnreliableWindowStart(now, 24, now.AddHours(-2)));
        Assert.Equal(now.AddHours(-24), AiAvailability.UnreliableWindowStart(now, 24, now.AddHours(-48)));
        Assert.Equal(now.AddHours(-24), AiAvailability.UnreadableWindowStart(now, 24));
    }

    [Fact]
    public void Log_before_a_new_key_review_falls_outside_the_window()
    {
        var now = new DateTime(2026, 11, 14, 12, 0, 0, DateTimeKind.Utc);
        var logAt = now.AddHours(-5);
        var reviewedAfterLog = now.AddHours(-1);

        var start = AiAvailability.UnreliableWindowStart(now, 24, reviewedAfterLog)!.Value;

        Assert.True(logAt < start);
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
