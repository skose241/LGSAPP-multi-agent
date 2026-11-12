using System.Threading.Channels;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Scheduler;

public sealed record ManualRunRequest(RunClaim Claim);

public sealed record ManualStartOutcome(ServiceResult<RunView> Result, int? ConflictRunId);

public sealed class SchedulerSignals
{
    private readonly Channel<ManualRunRequest> manual = Channel.CreateUnbounded<ManualRunRequest>(new UnboundedChannelOptions { SingleReader = true });
    private readonly Channel<bool> wake = Channel.CreateBounded<bool>(new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });

    public ChannelReader<ManualRunRequest> ManualReader => manual.Reader;
    public ChannelReader<bool> WakeReader => wake.Reader;

    public void EnqueueManual(ManualRunRequest request) => manual.Writer.TryWrite(request);

    public void Wake() => wake.Writer.TryWrite(true);
}

public interface ISchedulerService
{
    Task<ClaimResult> ClaimAsync(GenerationKind kind, GenerationTrigger trigger, int? userId, CancellationToken cancellationToken);
    Task ExecuteAsync(RunClaim claim, CancellationToken stoppingToken);
    Task<ManualStartOutcome> StartManualAsync(int userId, GenerationKind kind, CancellationToken cancellationToken);
}

public sealed class SchedulerService(
    IGenerationRunStore store,
    IDailyGenerationPlanner planner,
    ISchedulerQueryService queries,
    SchedulerSignals signals,
    IServiceProvider services,
    TurkeyTime clock,
    TimeProvider timeProvider,
    IOptions<SchedulerOptions> options,
    ILogger<SchedulerService> logger) : ISchedulerService
{
    public Task<ClaimResult> ClaimAsync(GenerationKind kind, GenerationTrigger trigger, int? userId, CancellationToken cancellationToken) =>
        store.ClaimAsync(kind, trigger, userId, cancellationToken);

    public async Task<ManualStartOutcome> StartManualAsync(int userId, GenerationKind kind, CancellationToken cancellationToken)
    {
        if (kind is GenerationKind.Generate or GenerationKind.Complete)
        {
            var plan = await planner.BuildAsync(clock.Today, true, cancellationToken);
            if (!plan.Enabled)
            {
                return new ManualStartOutcome(Fail.Conflict(SchedulerMessages.GenerationDisabledManual), null);
            }
        }

        var claim = await store.ClaimAsync(kind, GenerationTrigger.Manual, userId, cancellationToken);
        if (claim.Claim is null)
        {
            return new ManualStartOutcome(Fail.Conflict(claim.ConflictMessage ?? SchedulerMessages.AlreadyRunning), claim.ConflictRunId);
        }

        signals.EnqueueManual(new ManualRunRequest(claim.Claim));
        var view = await queries.GetRunViewAsync(claim.Claim.RunId, cancellationToken);
        return new ManualStartOutcome(ServiceResult<RunView>.Ok(view!), null);
    }

    public async Task ExecuteAsync(RunClaim claim, CancellationToken stoppingToken)
    {
        using var jobCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        using var heartbeatCts = new CancellationTokenSource();
        var heartbeat = HeartbeatAsync(claim.RunId, jobCts, heartbeatCts.Token);

        GenerationRunStatus status;
        JobOutcome outcome;
        var interrupted = false;
        try
        {
            var job = ResolveJob(claim.Kind);
            var deadline = claim.StartedAt.AddMinutes(options.Value.MaxRunMinutes);
            outcome = await job.RunAsync(new JobContext(claim, deadline), jobCts.Token);
            status = outcome.Status;
        }
        catch (OperationCanceledException)
        {
            interrupted = true;
            status = GenerationRunStatus.Interrupted;
            outcome = new JobOutcome(0, 0, stoppingToken.IsCancellationRequested
                ? "Uygulama kapanırken yarıda kesildi."
                : "Çalıştırma sahipliği kaybedildi.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Zamanlayıcı görevi başarısız oldu. Çalıştırma {RunId}, tür {Kind}", claim.RunId, claim.Kind);
            status = GenerationRunStatus.Failed;
            outcome = new JobOutcome(0, 1, $"Beklenmeyen hata: {ex.Message}");
        }

        await heartbeatCts.CancelAsync();
        try
        {
            await heartbeat;
        }
        catch (OperationCanceledException)
        {
        }

        var succeeded = outcome.Succeeded;
        var failed = outcome.Failed;
        var summary = outcome.Summary;
        using var finalizeCts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        try
        {
            if (interrupted || status == GenerationRunStatus.Failed && succeeded == 0)
            {
                var counted = await store.CountLogsAsync(claim.RunId, finalizeCts.Token);
                succeeded = Math.Max(succeeded, counted.Succeeded);
                failed = Math.Max(failed, counted.Failed);
                if (!interrupted && succeeded > 0)
                {
                    status = GenerationRunStatus.PartiallySucceeded;
                }
            }

            await store.FinalizeAsync(claim.RunId, status, succeeded, failed, summary, finalizeCts.Token);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Çalıştırma kapatılamadı; kira süresi dolunca devralınacak. Çalıştırma {RunId}", claim.RunId);
        }
    }

    private ISchedulerJob ResolveJob(GenerationKind kind) => kind switch
    {
        GenerationKind.Generate or GenerationKind.Complete => services.GetRequiredService<GenerationJob>(),
        GenerationKind.Publish => services.GetRequiredService<PublishJob>(),
        GenerationKind.CloseAssignments => services.GetRequiredService<AssignmentLifecycleJob>(),
        _ => throw new InvalidOperationException("Bilinmeyen görev türü.")
    };

    private async Task HeartbeatAsync(int runId, CancellationTokenSource jobCts, CancellationToken cancellationToken)
    {
        var o = options.Value;
        var lease = TimeSpan.FromSeconds(o.LeaseSeconds);
        var lastRenewed = clock.UtcNow;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(o.HeartbeatSeconds), timeProvider);
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                try
                {
                    if (!await store.RenewAsync(runId, cancellationToken))
                    {
                        logger.LogWarning("Çalıştırma {RunId} sahipliği kaybedildi; iş iptal ediliyor.", runId);
                        await jobCts.CancelAsync();
                        return;
                    }

                    lastRenewed = clock.UtcNow;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogWarning(ex, "Kira yenilenemedi. Çalıştırma {RunId}", runId);
                    if (clock.UtcNow - lastRenewed >= lease)
                    {
                        await jobCts.CancelAsync();
                        return;
                    }
                }
            }
        }
        catch (OperationCanceledException)
        {
        }
    }
}
