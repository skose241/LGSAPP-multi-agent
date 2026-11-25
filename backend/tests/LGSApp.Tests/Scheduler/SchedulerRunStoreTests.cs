using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Scheduler;

public sealed class SchedulerRunStoreTests : IAsyncLifetime
{
    private static readonly DateTimeOffset Now = new(2026, 11, 25, 15, 0, 0, TimeSpan.Zero);

    private readonly string _database = TestDatabase.NewName();
    private bool _available;

    public async Task InitializeAsync() =>
        _available = await TestDatabase.TryCreateAsync(_database, _ => Task.CompletedTask);

    public async Task DisposeAsync()
    {
        if (_available)
        {
            await TestDatabase.DropAsync(_database);
        }
    }

    private static GenerationRunStore NewStore(AppDbContext db) =>
        new(db, new TurkeyTime(new FakeTimeProvider(Now)), null!, Options.Create(new SchedulerOptions()));

    private async Task<int> SeedRunningAsync(GenerationKind kind, DateTime leaseUntil)
    {
        await using var db = TestDatabase.Open(_database);
        var run = new GenerationRun
        {
            RunDate = new DateOnly(2026, 11, 25),
            Kind = kind,
            Trigger = GenerationTrigger.Timer,
            Status = GenerationRunStatus.Running,
            StartedAt = leaseUntil.AddMinutes(-3),
            LeaseUntil = leaseUntil
        };
        db.GenerationRuns.Add(run);
        await db.SaveChangesAsync();
        return run.Id;
    }

    [Fact]
    public async Task Claim_takes_over_a_dead_run_and_marks_it_interrupted()
    {
        if (!_available)
        {
            return;
        }

        var deadId = await SeedRunningAsync(GenerationKind.Generate, Now.UtcDateTime.AddSeconds(-1));

        await using var db = TestDatabase.Open(_database);
        var result = await NewStore(db).ClaimAsync(GenerationKind.Complete, GenerationTrigger.Timer, null, CancellationToken.None);

        Assert.True(result.Succeeded);
        var taken = Assert.Single(result.TakenOver!);
        Assert.Equal(new TakenOverRun(deadId, GenerationKind.Generate), taken);

        await using var verify = TestDatabase.Open(_database);
        var dead = await verify.GenerationRuns.AsNoTracking().SingleAsync(r => r.Id == deadId);
        Assert.Equal(GenerationRunStatus.Interrupted, dead.Status);
        Assert.NotNull(dead.FinishedAt);
        Assert.Equal(SchedulerMessages.LeaseExpired, dead.Summary);
        var running = await verify.GenerationRuns.AsNoTracking().Where(r => r.Status == GenerationRunStatus.Running).ToListAsync();
        Assert.Equal(result.Claim!.RunId, Assert.Single(running).Id);
    }

    [Fact]
    public async Task Claim_is_rejected_while_the_lease_is_live()
    {
        if (!_available)
        {
            return;
        }

        var liveId = await SeedRunningAsync(GenerationKind.Generate, Now.UtcDateTime.AddSeconds(30));

        await using var db = TestDatabase.Open(_database);
        var result = await NewStore(db).ClaimAsync(GenerationKind.Complete, GenerationTrigger.Manual, null, CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal(liveId, result.ConflictRunId);
        Assert.Equal(SchedulerMessages.AlreadyRunning, result.ConflictMessage);
        Assert.Null(result.TakenOver);

        await using var verify = TestDatabase.Open(_database);
        Assert.Equal(GenerationRunStatus.Running, (await verify.GenerationRuns.AsNoTracking().SingleAsync(r => r.Id == liveId)).Status);
        Assert.Equal(1, await verify.GenerationRuns.CountAsync());
    }

    [Fact]
    public async Task Claim_at_exact_lease_boundary_is_still_live()
    {
        if (!_available)
        {
            return;
        }

        await SeedRunningAsync(GenerationKind.Publish, Now.UtcDateTime);

        await using var db = TestDatabase.Open(_database);
        var result = await NewStore(db).ClaimAsync(GenerationKind.Publish, GenerationTrigger.Timer, null, CancellationToken.None);

        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task Claim_does_not_touch_runs_of_another_group()
    {
        if (!_available)
        {
            return;
        }

        var deadPublish = await SeedRunningAsync(GenerationKind.Publish, Now.UtcDateTime.AddMinutes(-10));

        await using var db = TestDatabase.Open(_database);
        var result = await NewStore(db).ClaimAsync(GenerationKind.Generate, GenerationTrigger.Timer, null, CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Empty(result.TakenOver!);
        await using var verify = TestDatabase.Open(_database);
        Assert.Equal(GenerationRunStatus.Running, (await verify.GenerationRuns.AsNoTracking().SingleAsync(r => r.Id == deadPublish)).Status);
    }

    [Fact]
    public async Task Concurrent_claims_allow_only_one_winner()
    {
        if (!_available)
        {
            return;
        }

        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(async _ =>
        {
            await using var db = TestDatabase.Open(_database);
            return await NewStore(db).ClaimAsync(GenerationKind.Generate, GenerationTrigger.Timer, null, CancellationToken.None);
        }));

        Assert.Equal(1, results.Count(r => r.Succeeded));
        Assert.Equal(1, results.Count(r => !r.Succeeded));
        await using var verify = TestDatabase.Open(_database);
        Assert.Equal(1, await verify.GenerationRuns.CountAsync(r => r.Status == GenerationRunStatus.Running));
    }

    [Fact]
    public async Task Concurrent_claims_across_generate_and_complete_allow_only_one_winner()
    {
        if (!_available)
        {
            return;
        }

        var kinds = new[] { GenerationKind.Generate, GenerationKind.Complete };
        var results = await Task.WhenAll(kinds.Select(async kind =>
        {
            await using var db = TestDatabase.Open(_database);
            return await NewStore(db).ClaimAsync(kind, GenerationTrigger.Timer, null, CancellationToken.None);
        }));

        Assert.Equal(1, results.Count(r => r.Succeeded));
    }
}
