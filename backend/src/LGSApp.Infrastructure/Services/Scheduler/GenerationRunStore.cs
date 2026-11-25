using System.Data;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Scheduler;

public sealed record RunClaim(int RunId, GenerationKind Kind, GenerationTrigger Trigger, int? UserId, DateOnly RunDate, DateTime StartedAt);

public sealed record TakenOverRun(int RunId, GenerationKind Kind);

public sealed record ClaimResult(RunClaim? Claim, string? ConflictMessage, int? ConflictRunId, IReadOnlyList<TakenOverRun>? TakenOver = null)
{
    public bool Succeeded => Claim is not null;
}

public interface IGenerationRunStore
{
    Task<ClaimResult> ClaimAsync(GenerationKind kind, GenerationTrigger trigger, int? userId, CancellationToken cancellationToken);
    Task<IReadOnlyList<RunInfo>> GetRunsAsync(DateOnly runDate, CancellationToken cancellationToken);
    Task<bool> RenewAsync(int runId, CancellationToken cancellationToken);
    Task FinalizeAsync(int runId, GenerationRunStatus status, int succeeded, int failed, string? summary, CancellationToken cancellationToken);
    Task<(int Succeeded, int Failed)> CountLogsAsync(int runId, CancellationToken cancellationToken);
}

public sealed class GenerationRunStore(
    AppDbContext db,
    TurkeyTime clock,
    IServiceScopeFactory scopes,
    IOptions<SchedulerOptions> options) : IGenerationRunStore
{
    public const string LockResource = "LGSApp.Scheduler.Claim";
    public const int SummaryMaxLength = 1000;

    public async Task<ClaimResult> ClaimAsync(GenerationKind kind, GenerationTrigger trigger, int? userId, CancellationToken cancellationToken)
    {
        var (low, high) = GroupRange(kind);
        try
        {
            return await db.ExecuteInTransactionAsync(async token =>
            {
                var lockResult = new SqlParameter("@result", SqlDbType.Int) { Direction = ParameterDirection.Output };
                await db.Database.ExecuteSqlRawAsync(
                    "EXEC @result = sp_getapplock @Resource = @resource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000",
                    [lockResult, new SqlParameter("@resource", LockResource)],
                    token);
                if (lockResult.Value is not int code || code < 0)
                {
                    return new ClaimResult(null, SchedulerMessages.AlreadyRunning, null);
                }

                var now = clock.UtcNow;
                var running = (byte)GenerationRunStatus.Running;
                var rows = await db.GenerationRuns
                    .FromSqlInterpolated($"SELECT * FROM [GenerationRuns] WITH (UPDLOCK, ROWLOCK) WHERE [Status] = {running} AND [Kind] BETWEEN {low} AND {high}")
                    .ToListAsync(token);

                var live = rows.FirstOrDefault(r => r.LeaseUntil >= now);
                if (live is not null)
                {
                    return new ClaimResult(null, SchedulerMessages.AlreadyRunning, live.Id);
                }

                var takenOver = rows.Select(r => new TakenOverRun(r.Id, r.Kind)).ToList();
                if (rows.Count > 0)
                {
                    foreach (var stale in rows)
                    {
                        stale.Status = GenerationRunStatus.Interrupted;
                        stale.FinishedAt = now;
                        stale.Summary = SchedulerMessages.LeaseExpired;
                    }

                    await db.SaveChangesAsync(token);
                }

                var run = new GenerationRun
                {
                    RunDate = TurkeyTime.ToLocalDate(now),
                    Kind = kind,
                    Trigger = trigger,
                    TriggeredByUserId = userId,
                    Status = GenerationRunStatus.Running,
                    StartedAt = now,
                    LeaseUntil = now.AddSeconds(options.Value.LeaseSeconds)
                };
                db.GenerationRuns.Add(run);
                try
                {
                    await db.SaveChangesAsync(token);
                }
                catch (DbUpdateException ex) when (ex.IsUniqueViolation())
                {
                    db.ChangeTracker.Clear();
                    return new ClaimResult(null, SchedulerMessages.AlreadyRunning, null, takenOver);
                }

                return new ClaimResult(new RunClaim(run.Id, kind, trigger, userId, run.RunDate, now), null, null, takenOver);
            }, cancellationToken);
        }
        finally
        {
            db.ChangeTracker.Clear();
        }
    }

    public async Task<IReadOnlyList<RunInfo>> GetRunsAsync(DateOnly runDate, CancellationToken cancellationToken) =>
        await db.GenerationRuns.AsNoTracking()
            .Where(r => r.RunDate == runDate)
            .OrderBy(r => r.Id)
            .Select(r => new RunInfo(r.Id, r.Kind, r.Trigger, r.Status, r.StartedAt, r.FinishedAt, r.LeaseUntil, r.SucceededCount))
            .ToListAsync(cancellationToken);

    public async Task<bool> RenewAsync(int runId, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var until = clock.UtcNow.AddSeconds(options.Value.LeaseSeconds);
        var affected = await context.GenerationRuns
            .Where(r => r.Id == runId && r.Status == GenerationRunStatus.Running)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.LeaseUntil, until), cancellationToken);
        return affected > 0;
    }

    public async Task FinalizeAsync(int runId, GenerationRunStatus status, int succeeded, int failed, string? summary, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = clock.UtcNow;
        var text = summary is { Length: > SummaryMaxLength } ? summary[..SummaryMaxLength] : summary;
        await context.GenerationRuns
            .Where(r => r.Id == runId && r.Status == GenerationRunStatus.Running)
            .ExecuteUpdateAsync(
                s => s.SetProperty(r => r.Status, status)
                    .SetProperty(r => r.FinishedAt, now)
                    .SetProperty(r => r.SucceededCount, succeeded)
                    .SetProperty(r => r.FailedCount, failed)
                    .SetProperty(r => r.Summary, text),
                cancellationToken);
    }

    public async Task<(int Succeeded, int Failed)> CountLogsAsync(int runId, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var counts = await context.GenerationLogs.AsNoTracking()
            .Where(l => l.RunId == runId)
            .GroupBy(l => l.Status)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        return (
            counts.Where(c => c.Key == GenerationLogStatus.Success).Sum(c => c.Count),
            counts.Where(c => c.Key == GenerationLogStatus.Failed).Sum(c => c.Count));
    }

    private static (byte Low, byte High) GroupRange(GenerationKind kind) => kind switch
    {
        GenerationKind.Generate or GenerationKind.Complete => ((byte)GenerationKind.Generate, (byte)GenerationKind.Complete),
        _ => ((byte)kind, (byte)kind)
    };
}
