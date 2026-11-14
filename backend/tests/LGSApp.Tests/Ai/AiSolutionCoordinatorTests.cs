using LGSApp.Infrastructure.Services.Ai;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace LGSApp.Tests.Ai;

public class AiSolutionCoordinatorTests
{
    private sealed class TestLifetime : IHostApplicationLifetime
    {
        private readonly CancellationTokenSource stopping = new();

        public CancellationToken ApplicationStarted => CancellationToken.None;
        public CancellationToken ApplicationStopping => stopping.Token;
        public CancellationToken ApplicationStopped => CancellationToken.None;

        public void StopApplication() => stopping.Cancel();
    }

    private static (AiSolutionCoordinator Coordinator, TestLifetime Lifetime) Create()
    {
        var provider = new ServiceCollection().BuildServiceProvider();
        var lifetime = new TestLifetime();
        return (new AiSolutionCoordinator(provider.GetRequiredService<IServiceScopeFactory>(), lifetime, NullLogger<AiSolutionCoordinator>.Instance), lifetime);
    }

    [Fact]
    public async Task Five_concurrent_callers_share_one_production()
    {
        var (coordinator, _) = Create();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;

        Task<AiProduction> Work(IServiceProvider services, CancellationToken token)
        {
            Interlocked.Increment(ref calls);
            return Task.Run(async () =>
            {
                await gate.Task;
                return new AiProduction(AiProductionKind.Created, 77);
            });
        }

        var starts = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => Task.Run(() => coordinator.GetOrStart(10, Work))));
        gate.SetResult();
        var results = await Task.WhenAll(starts.Select(s => s.Task));

        Assert.Equal(1, calls);
        Assert.Equal(1, starts.Count(s => s.Started));
        Assert.All(results, r => Assert.Equal(77, r.SolutionId));
        Assert.Equal(0, coordinator.RunningCount);
    }

    [Fact]
    public async Task Different_questions_run_independently()
    {
        var (coordinator, _) = Create();
        var calls = 0;

        Task<AiProduction> Work(IServiceProvider services, CancellationToken token)
        {
            Interlocked.Increment(ref calls);
            return Task.FromResult(new AiProduction(AiProductionKind.Created));
        }

        await coordinator.GetOrStart(1, Work).Task;
        await coordinator.GetOrStart(2, Work).Task;

        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task Cancelling_one_caller_does_not_cancel_the_production()
    {
        var (coordinator, _) = Create();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var workToken = CancellationToken.None;

        var (task, started) = coordinator.GetOrStart(5, async (services, token) =>
        {
            workToken = token;
            await gate.Task;
            token.ThrowIfCancellationRequested();
            return new AiProduction(AiProductionKind.Created, 5);
        });
        Assert.True(started);

        using var callerCts = new CancellationTokenSource();
        var waiting = task.WaitAsync(callerCts.Token);
        var other = coordinator.TryJoin(5)!;
        callerCts.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => waiting);

        Assert.False(task.IsCompleted);
        Assert.False(workToken.IsCancellationRequested);
        gate.SetResult();
        Assert.Equal(5, (await other).SolutionId);
        Assert.Equal(5, (await task).SolutionId);
    }

    [Fact]
    public async Task Application_stopping_cancels_the_production_token()
    {
        var (coordinator, lifetime) = Create();
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var (task, _) = coordinator.GetOrStart(8, async (services, token) =>
        {
            started.SetResult();
            await Task.Delay(Timeout.Infinite, token);
            return new AiProduction(AiProductionKind.Created);
        });
        await started.Task;
        lifetime.StopApplication();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task.WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.Equal(0, coordinator.RunningCount);
    }

    [Fact]
    public async Task Failure_clears_the_entry_and_next_request_starts_fresh()
    {
        var (coordinator, _) = Create();

        var (failing, _) = coordinator.GetOrStart(3, (services, token) => throw new InvalidOperationException("patladı"));
        await Assert.ThrowsAsync<InvalidOperationException>(() => failing);
        Assert.Equal(0, coordinator.RunningCount);
        Assert.Null(coordinator.TryJoin(3));

        var (task, started) = coordinator.GetOrStart(3, (services, token) => Task.FromResult(new AiProduction(AiProductionKind.Created, 1)));
        Assert.True(started);
        Assert.Equal(1, (await task).SolutionId);
        Assert.Equal(0, coordinator.RunningCount);
    }

    [Fact]
    public async Task Joining_a_running_production_returns_the_same_task()
    {
        var (coordinator, _) = Create();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var (task, _) = coordinator.GetOrStart(9, async (services, token) =>
        {
            await gate.Task;
            return new AiProduction(AiProductionKind.UnderReview, 2);
        });

        Assert.Same(task, coordinator.TryJoin(9));
        gate.SetResult();
        await task;
    }
}
