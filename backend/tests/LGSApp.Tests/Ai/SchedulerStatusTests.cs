using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.Extensions.Time.Testing;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Ai;

public class SchedulerStatusTests
{
    private sealed class EmptyStore : IGenerationRunStore
    {
        public Task<ClaimResult> ClaimAsync(GenerationKind kind, GenerationTrigger trigger, int? userId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<IReadOnlyList<RunInfo>> GetRunsAsync(DateOnly runDate, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<RunInfo>>([]);
        public Task<bool> RenewAsync(int runId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task FinalizeAsync(int runId, GenerationRunStatus status, int succeeded, int failed, string? summary, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<(int Succeeded, int Failed)> CountLogsAsync(int runId, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private sealed class EmptyPlanner : IDailyGenerationPlanner
    {
        public Task<DailyGenerationPlan> BuildAsync(DateOnly today, bool refreshSettings, CancellationToken cancellationToken) =>
            Task.FromResult(new DailyGenerationPlan(null, true, []));
    }

    private sealed class FakeGenerator : IQuestionGenerator
    {
        public bool IsConfigured => true;
        public Task<QuestionGenerationResult> GenerateAsync(QuestionGenerationRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private sealed class FakeVerifier : IQuestionVerifier
    {
        public Task<bool> IsEnabledAsync(CancellationToken cancellationToken) => Task.FromResult(false);
        public Task<QuestionVerification> VerifyAsync(QuestionGenerationRequest request, ValidatedQuestion question, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private static Task<SchedulerStatusView> StatusAsync(SchedulerOptions options)
    {
        var clock = new TurkeyTime(new FakeTimeProvider(new DateTimeOffset(2026, 11, 14, 8, 0, 0, TimeSpan.Zero)));
        var service = new SchedulerQueryService(null!, new EmptyStore(), new EmptyPlanner(), new FakeGenerator(), new FakeVerifier(), clock, Options.Create(options), Options.Create(AiTestData.GeminiOptions()));
        return service.GetStatusAsync(CancellationToken.None);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Timer_enabled_follows_options(bool enabled)
    {
        var status = await StatusAsync(new SchedulerOptions { Enabled = enabled });
        Assert.Equal(enabled, status.TimerEnabled);
    }

    [Fact]
    public async Task Job_times_come_from_options_in_turkey_time()
    {
        var status = await StatusAsync(new SchedulerOptions { GenerateAt = "9:05", CompleteAt = "10:00", PublishAt = "11:30", AssignmentsAt = "00:10" });

        var times = status.Jobs.ToDictionary(j => j.Kind, j => j.ScheduledAt);
        Assert.Equal("09:05", times["generate"]);
        Assert.Equal("10:00", times["complete"]);
        Assert.Equal("11:30", times["publish"]);
        Assert.Equal("00:10", times["assignments"]);
        Assert.Equal(new DateTime(2026, 11, 14, 6, 5, 0, DateTimeKind.Utc), status.Jobs.Single(j => j.Kind == "generate").ScheduledAtUtc);
    }
}
