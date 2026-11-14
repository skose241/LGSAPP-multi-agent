using System.Globalization;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Ai;
using Microsoft.Extensions.Time.Testing;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Ai;

public class AiQuotaDayBoundaryTests
{
    private static DateTime Utc(string value) => DateTime.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal);

    [Theory]
    [InlineData("2026-11-14T20:59:00Z", "2026-11-13T21:00:00Z", "2026-11-14T21:00:00Z")]
    [InlineData("2026-11-14T21:01:00Z", "2026-11-14T21:00:00Z", "2026-11-15T21:00:00Z")]
    [InlineData("2026-11-14T21:00:00Z", "2026-11-14T21:00:00Z", "2026-11-15T21:00:00Z")]
    [InlineData("2026-11-14T00:00:00Z", "2026-11-13T21:00:00Z", "2026-11-14T21:00:00Z")]
    public void Turkey_day_rolls_over_at_2100_utc(string now, string from, string to)
    {
        var (start, end) = AiQuotaService.DayBoundsUtc(Utc(now));

        Assert.Equal(Utc(from), start);
        Assert.Equal(Utc(to), end);
        Assert.Equal(DateTimeKind.Utc, start.Kind);
    }

    [Fact]
    public void Retry_after_counts_seconds_to_turkey_midnight()
    {
        var now = new DateTime(2026, 11, 14, 20, 59, 0, DateTimeKind.Utc);
        var (_, end) = AiQuotaService.DayBoundsUtc(now);

        Assert.Equal(60, AiQuotaService.SecondsUntil(now, end));
        Assert.Equal(1, AiQuotaService.SecondsUntil(end, end));
    }

    [Fact]
    public void Lock_resources_are_per_user_and_global()
    {
        Assert.Equal("ai-quota:12", AiQuotaService.UserLockResource(12));
        Assert.Equal("ai-quota:global", AiQuotaService.GlobalLockResource);
    }
}

public class AiCallLoggerTests
{
    [Fact]
    public void Input_replaces_image_bytes_with_a_marker_and_stays_within_the_limit()
    {
        var input = AiCallLogger.BuildInput(new string('a', 9000), 55, "abc123");

        Assert.True(input.Length <= LGSApp.Domain.Constants.AiRules.LogInputMaxLength);
        Assert.EndsWith("[görsel StoredFile#55, sha256=abc123]", input);
    }

    [Fact]
    public void Input_without_image_has_no_marker()
    {
        Assert.Equal("metin", AiCallLogger.BuildInput("metin", null, null));
    }

    [Fact]
    public void Sha256_is_lowercase_hex()
    {
        var hash = AiCallLogger.ComputeSha256([1, 2, 3]);

        Assert.Equal(64, hash.Length);
        Assert.Equal(hash.ToLowerInvariant(), hash);
    }
}

public class FakeAiSolverTests
{
    private sealed class Keys(int? key) : IFakeAnswerKeySource
    {
        public Task<int?> GetKeyAsync(int questionId, CancellationToken cancellationToken) => Task.FromResult(key);
    }

    private static FakeAiSolver Create(int? key, int mismatchEvery = 0, string unreadable = "", int delayMs = 0, FakeTimeProvider? clock = null)
    {
        var options = new AiOptions { Provider = AiProvider.Fake, Fake = new AiFakeOptions { MismatchEveryNth = mismatchEvery, UnreadableQuestionIds = unreadable, DelayMs = delayMs } };
        return new FakeAiSolver(Options.Create(options), new Keys(key), clock ?? new FakeTimeProvider());
    }

    private static AiSolveInput Input(int? verified = null) => new("Matematik", null, "Soru", "1", "2", "3", "4", null, verified);

    [Fact]
    public async Task Blind_answer_follows_the_stored_key()
    {
        var result = await Create(3).SolveAsync(1, Input(), AiSolveMode.Blind, CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal(3, result.Answer);
        Assert.True(result.Readable);
        Assert.True(result.Solution!.Length >= 50);
        Assert.Equal(AiSolveOutcome.Accepted, AiSolveClassifier.Classify(result, AiSolveMode.Blind, 3).Outcome);
    }

    [Fact]
    public async Task Every_nth_call_disagrees_with_the_key()
    {
        var solver = Create(2, mismatchEvery: 3);

        var answers = new List<int>();
        for (var i = 0; i < 6; i++)
        {
            answers.Add((await solver.SolveAsync(1, Input(), AiSolveMode.Blind, CancellationToken.None)).Answer);
        }

        Assert.Equal([2, 2, 3, 2, 2, 3], answers);
    }

    [Fact]
    public async Task Verified_mode_reports_disagreement_on_nth_call()
    {
        var solver = Create(null, mismatchEvery: 2);

        var first = await solver.SolveAsync(1, Input(4), AiSolveMode.Verified, CancellationToken.None);
        var second = await solver.SolveAsync(1, Input(4), AiSolveMode.Verified, CancellationToken.None);

        Assert.True(first.AgreesWithKey);
        Assert.Equal(4, first.Answer);
        Assert.False(second.AgreesWithKey);
        Assert.Equal(AiSolveOutcome.Unreliable, AiSolveClassifier.Classify(second, AiSolveMode.Verified, 4).Outcome);
    }

    [Fact]
    public async Task Listed_questions_are_unreadable()
    {
        var solver = Create(1, unreadable: "5, 9");

        var listed = await solver.SolveAsync(9, Input(), AiSolveMode.Blind, CancellationToken.None);
        var other = await solver.SolveAsync(6, Input(), AiSolveMode.Blind, CancellationToken.None);

        Assert.False(listed.Readable);
        Assert.Equal(AiSolveOutcome.Unreadable, AiSolveClassifier.Classify(listed, AiSolveMode.Blind, 1).Outcome);
        Assert.True(other.Readable);
    }

    [Fact]
    public async Task Unknown_key_is_unreliable()
    {
        var result = await Create(null).SolveAsync(1, Input(), AiSolveMode.Blind, CancellationToken.None);

        Assert.Equal(AiSolveOutcome.Unreliable, AiSolveClassifier.Classify(result, AiSolveMode.Blind, 1).Outcome);
    }

    [Fact]
    public async Task Delay_waits_on_the_time_provider()
    {
        var clock = new FakeTimeProvider();
        var task = Create(1, delayMs: 5000, clock: clock).SolveAsync(1, Input(), AiSolveMode.Blind, CancellationToken.None);

        await Task.Delay(50);
        Assert.False(task.IsCompleted);
        clock.Advance(TimeSpan.FromSeconds(5));
        var result = await task.WaitAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(1, result.Answer);
    }

    [Fact]
    public async Task Cancellation_is_honoured_during_delay()
    {
        using var cts = new CancellationTokenSource();
        var task = Create(1, delayMs: 5000).SolveAsync(1, Input(), AiSolveMode.Blind, cts.Token);
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task);
    }
}

public class NotConfiguredAiSolverTests
{
    [Fact]
    public async Task Reports_not_configured_without_calling_anything()
    {
        var solver = new NotConfiguredAiSolver();

        var result = await solver.SolveAsync(1, new AiSolveInput("D", null, "s", null, null, null, null, null, null), AiSolveMode.Blind, CancellationToken.None);

        Assert.False(solver.IsConfigured);
        Assert.Equal(AiErrorKind.NotConfigured, result.ErrorKind);
        Assert.True(result.ErrorKind.IsProviderFailure());
    }
}
