using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Assignments;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Scheduler;

public class SchedulerServiceTests
{
    private sealed record Finalized(int RunId, GenerationRunStatus Status, int Succeeded, int Failed, string? Summary);

    private sealed record Notice(int RoleId, NotificationType Type, string Message, int RunId);

    private sealed class FakeStore : IGenerationRunStore
    {
        public List<Finalized> Finalizations { get; } = [];
        public int ClaimCalls { get; private set; }
        public ClaimResult NextClaim { get; set; } = new(null, SchedulerMessages.AlreadyRunning, 99);

        public Task<ClaimResult> ClaimAsync(GenerationKind kind, GenerationTrigger trigger, int? userId, CancellationToken cancellationToken)
        {
            ClaimCalls++;
            return Task.FromResult(NextClaim);
        }

        public Task<IReadOnlyList<RunInfo>> GetRunsAsync(DateOnly runDate, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<RunInfo>>([]);
        public Task<bool> RenewAsync(int runId, CancellationToken cancellationToken) => Task.FromResult(true);

        public Task FinalizeAsync(int runId, GenerationRunStatus status, int succeeded, int failed, string? summary, CancellationToken cancellationToken)
        {
            Finalizations.Add(new Finalized(runId, status, succeeded, failed, summary));
            return Task.CompletedTask;
        }

        public Task<(int Succeeded, int Failed)> CountLogsAsync(int runId, CancellationToken cancellationToken) => Task.FromResult((0, 0));
    }

    private sealed class FakeNotifier : IRunNotifier
    {
        public List<Notice> Notices { get; } = [];
        public bool Throw { get; set; }
        public bool ThrowCancelled { get; set; }
        public CancellationToken LastToken { get; private set; }

        public Task<int> NotifyRoleAsync(int roleId, NotificationType type, string message, int runId, CancellationToken cancellationToken = default)
        {
            LastToken = cancellationToken;
            if (ThrowCancelled)
            {
                throw new OperationCanceledException();
            }

            if (Throw)
            {
                throw new InvalidOperationException("bildirim hatasi");
            }

            Notices.Add(new Notice(roleId, type, message, runId));
            return Task.FromResult(1);
        }
    }

    private sealed class FakePlanner(int? aiUserId) : IDailyGenerationPlanner
    {
        public Task<DailyGenerationPlan> BuildAsync(DateOnly today, bool refreshSettings, CancellationToken cancellationToken) =>
            Task.FromResult(new DailyGenerationPlan(aiUserId, true, []));
    }

    private sealed class FakeGenerator(bool configured) : IQuestionGenerator
    {
        public bool IsConfigured => configured;
        public Task<QuestionGenerationResult> GenerateAsync(QuestionGenerationRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private sealed class FakeVerifier : IQuestionVerifier
    {
        public Task<bool> IsEnabledAsync(CancellationToken cancellationToken) => Task.FromResult(false);
        public Task<QuestionVerification> VerifyAsync(QuestionGenerationRequest request, ValidatedQuestion question, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private sealed class FakeLifecycle(Func<CancellationToken, Task<int>> body) : IAssignmentLifecycleService
    {
        public Task<int> ActivateDueAsync(DateOnly today, CancellationToken cancellationToken = default) => Task.FromResult(0);
        public Task<int> CloseDueAsync(DateOnly today, CancellationToken cancellationToken = default) => body(cancellationToken);
    }

    private static readonly TurkeyTime Clock = new(TimeProvider.System);

    private static SchedulerService NewService(FakeStore store, FakeNotifier notifier, IAssignmentLifecycleService lifecycle, bool configured = true)
    {
        var services = new ServiceCollection();
        services.AddSingleton(lifecycle);
        services.AddSingleton<AssignmentLifecycleJob>();
        return new SchedulerService(
            store,
            new FakePlanner(1),
            null!,
            new SchedulerSignals(),
            services.BuildServiceProvider(),
            notifier,
            new FakeGenerator(configured),
            Clock,
            TimeProvider.System,
            Options.Create(new SchedulerOptions()),
            NullLogger<SchedulerService>.Instance);
    }

    private static RunClaim Claim(GenerationKind kind = GenerationKind.CloseAssignments, int runId = 7) =>
        new(runId, kind, GenerationTrigger.Timer, null, new DateOnly(2026, 11, 25), DateTime.UtcNow);

    [Fact]
    public async Task Cancellation_finalizes_as_interrupted_and_notifies_managers()
    {
        var store = new FakeStore();
        var notifier = new FakeNotifier();
        var started = new TaskCompletionSource();
        var service = NewService(store, notifier, new FakeLifecycle(async token =>
        {
            started.SetResult();
            await Task.Delay(Timeout.Infinite, token);
            return 0;
        }));
        using var stopping = new CancellationTokenSource();

        var run = service.ExecuteAsync(Claim(), stopping.Token);
        await started.Task;
        await stopping.CancelAsync();
        await run;

        var final = Assert.Single(store.Finalizations);
        Assert.Equal(GenerationRunStatus.Interrupted, final.Status);
        Assert.Equal(7, final.RunId);
        Assert.Equal(SchedulerMessages.InterruptedOnShutdown, final.Summary);
        var notice = Assert.Single(notifier.Notices);
        Assert.Equal(Roles.MudurId, notice.RoleId);
        Assert.Equal(NotificationType.GenerationReport, notice.Type);
        Assert.Equal(7, notice.RunId);
        Assert.Equal(SchedulerMessages.RunInterruptedNotice(GenerationKind.CloseAssignments, true), notice.Message);
    }

    [Fact]
    public async Task Exception_finalizes_as_failed_and_notifies_managers()
    {
        var store = new FakeStore();
        var notifier = new FakeNotifier();
        var service = NewService(store, notifier, new FakeLifecycle(_ => throw new InvalidOperationException("patladi")));

        await service.ExecuteAsync(Claim(), CancellationToken.None);

        var final = Assert.Single(store.Finalizations);
        Assert.Equal(GenerationRunStatus.Failed, final.Status);
        Assert.Equal(1, final.Failed);
        Assert.Equal(SchedulerMessages.UnexpectedError, final.Summary);
        var notice = Assert.Single(notifier.Notices);
        Assert.Equal(SchedulerMessages.RunFailureNotice(GenerationKind.CloseAssignments), notice.Message);
    }

    [Fact]
    public async Task Successful_run_finalizes_as_succeeded_without_notice()
    {
        var store = new FakeStore();
        var notifier = new FakeNotifier();
        var service = NewService(store, notifier, new FakeLifecycle(_ => Task.FromResult(2)));

        await service.ExecuteAsync(Claim(), CancellationToken.None);

        Assert.Equal(GenerationRunStatus.Succeeded, Assert.Single(store.Finalizations).Status);
        Assert.Empty(notifier.Notices);
    }

    [Fact]
    public async Task Notification_failure_does_not_break_the_failure_path()
    {
        var store = new FakeStore();
        var notifier = new FakeNotifier { Throw = true };
        var service = NewService(store, notifier, new FakeLifecycle(_ => throw new InvalidOperationException("patladi")));

        await service.ExecuteAsync(Claim(), CancellationToken.None);

        Assert.Equal(GenerationRunStatus.Failed, Assert.Single(store.Finalizations).Status);
    }

    [Theory]
    [InlineData(GenerationKind.Generate)]
    [InlineData(GenerationKind.Complete)]
    public async Task Manual_generate_and_complete_are_rejected_when_ai_is_not_configured(GenerationKind kind)
    {
        var store = new FakeStore();
        var service = NewService(store, new FakeNotifier(), new FakeLifecycle(_ => Task.FromResult(0)), configured: false);

        var outcome = await service.StartManualAsync(1, kind, CancellationToken.None);

        Assert.False(outcome.Result.Succeeded);
        Assert.Equal(ServiceErrorKind.Conflict, outcome.Result.Error);
        Assert.Equal(SchedulerMessages.AiNotConfiguredManual, outcome.Result.Message);
        Assert.Contains("başlatamazsınız", outcome.Result.Message);
        Assert.Equal(0, store.ClaimCalls);
    }

    [Theory]
    [InlineData(GenerationKind.Publish)]
    [InlineData(GenerationKind.CloseAssignments)]
    public async Task Manual_publish_and_assignments_ignore_missing_ai_configuration(GenerationKind kind)
    {
        var store = new FakeStore();
        var service = NewService(store, new FakeNotifier(), new FakeLifecycle(_ => Task.FromResult(0)), configured: false);

        var outcome = await service.StartManualAsync(1, kind, CancellationToken.None);

        Assert.Equal(1, store.ClaimCalls);
        Assert.Equal(SchedulerMessages.AlreadyRunning, outcome.Result.Message);
        Assert.Equal(99, outcome.ConflictRunId);
    }

    [Fact]
    public async Task Timer_claim_notifies_managers_about_each_taken_over_run()
    {
        var store = new FakeStore
        {
            NextClaim = new ClaimResult(null, SchedulerMessages.AlreadyRunning, null, [new TakenOverRun(4, GenerationKind.Generate), new TakenOverRun(5, GenerationKind.Complete)])
        };
        var notifier = new FakeNotifier();
        var service = NewService(store, notifier, new FakeLifecycle(_ => Task.FromResult(0)));

        await service.ClaimAsync(GenerationKind.Generate, GenerationTrigger.Timer, null, CancellationToken.None);

        Assert.Equal([4, 5], notifier.Notices.Select(n => n.RunId).ToArray());
        Assert.All(notifier.Notices, n =>
        {
            Assert.Equal(Roles.MudurId, n.RoleId);
            Assert.Equal(NotificationType.GenerationReport, n.Type);
        });
        Assert.Equal(SchedulerMessages.RunTakenOverNotice(GenerationKind.Complete), notifier.Notices[1].Message);
    }

    [Fact]
    public async Task Claim_without_takeover_sends_no_notice_and_notice_failure_is_swallowed()
    {
        var store = new FakeStore();
        var notifier = new FakeNotifier();
        var service = NewService(store, notifier, new FakeLifecycle(_ => Task.FromResult(0)));
        await service.ClaimAsync(GenerationKind.Generate, GenerationTrigger.Timer, null, CancellationToken.None);
        Assert.Empty(notifier.Notices);

        store.NextClaim = new ClaimResult(null, SchedulerMessages.AlreadyRunning, null, [new TakenOverRun(4, GenerationKind.Generate)]);
        notifier.Throw = true;
        var result = await service.ClaimAsync(GenerationKind.Generate, GenerationTrigger.Timer, null, CancellationToken.None);
        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task Takeover_notice_ignores_cancelled_host_token_and_never_breaks_the_claim()
    {
        var claim = new ClaimResult(Claim(GenerationKind.Generate, 21), null, null, [new TakenOverRun(4, GenerationKind.Generate)]);
        var store = new FakeStore { NextClaim = claim };
        var notifier = new FakeNotifier();
        var service = NewService(store, notifier, new FakeLifecycle(_ => Task.FromResult(0)));
        using var cancelled = new CancellationTokenSource();
        await cancelled.CancelAsync();

        var result = await service.ClaimAsync(GenerationKind.Generate, GenerationTrigger.Timer, null, cancelled.Token);

        Assert.True(result.Succeeded);
        Assert.Single(notifier.Notices);
        Assert.False(notifier.LastToken.IsCancellationRequested);
        Assert.NotEqual(cancelled.Token, notifier.LastToken);

        notifier.ThrowCancelled = true;
        var again = await service.ClaimAsync(GenerationKind.Generate, GenerationTrigger.Timer, null, cancelled.Token);
        Assert.True(again.Succeeded);
    }

    [Fact]
    public async Task Missing_ai_account_fails_the_run_and_notifies_managers()
    {
        var notifier = new FakeNotifier();
        var job = new GenerationJob(
            new FakePlanner(null),
            new FakeGenerator(true),
            new FakeVerifier(),
            null!,
            notifier,
            null!,
            Clock,
            TimeProvider.System,
            Options.Create(new SchedulerOptions()),
            NullLogger<GenerationJob>.Instance);

        var outcome = await job.RunAsync(new JobContext(Claim(GenerationKind.Generate, 12), DateTime.UtcNow.AddMinutes(30)), CancellationToken.None);

        Assert.Equal(GenerationRunStatus.Failed, outcome.Status);
        Assert.Equal(SchedulerMessages.AiAccountMissing, outcome.Summary);
        var notice = Assert.Single(notifier.Notices);
        Assert.Equal(12, notice.RunId);
        Assert.Equal(Roles.MudurId, notice.RoleId);
        Assert.Equal(SchedulerMessages.AiAccountMissingNotice(GenerationKind.Generate), notice.Message);
    }
}
