using System.Collections.Concurrent;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Scheduler;

public sealed class SchedulerWorker(
    IServiceScopeFactory scopes,
    SchedulerSignals signals,
    TimeProvider timeProvider,
    IOptions<SchedulerOptions> options,
    ILogger<SchedulerWorker> logger) : BackgroundService
{
    private static readonly TimeSpan FailureDelay = TimeSpan.FromSeconds(30);
    private readonly ConcurrentDictionary<int, Task> manualTasks = new();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.WhenAll(TimerLoopAsync(stoppingToken), ManualLoopAsync(stoppingToken));
            await Task.WhenAll(manualTasks.Values);
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            logger.LogCritical(ex, "Zamanlayıcı çalışanı beklenmeyen şekilde durdu.");
        }
    }

    private async Task TimerLoopAsync(CancellationToken stoppingToken)
    {
        try
        {
            var o = options.Value;
            if (o.Enabled)
            {
                var startup = TimeSpan.FromSeconds(o.StartupDelaySeconds + (o.StartupDelaySeconds > 0 ? Random.Shared.Next(0, o.StartupDelaySeconds + 1) : 0));
                await Task.Delay(startup, timeProvider, stoppingToken);
            }

            while (!stoppingToken.IsCancellationRequested)
            {
                var delay = TimeSpan.FromHours(SchedulerOptions.MaxSleepHours);
                if (o.Enabled)
                {
                    delay = await StepAsync(stoppingToken);
                }

                await WaitAsync(delay, stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private async Task<TimeSpan> StepAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var store = scope.ServiceProvider.GetRequiredService<IGenerationRunStore>();
            var now = timeProvider.GetUtcNow().UtcDateTime;
            var today = TurkeyTime.ToLocalDate(now);
            var runs = await store.GetRunsAsync(today, stoppingToken);
            var plan = SchedulerPlanner.Plan(options.Value, now, today, runs);

            if (plan.Due.Count > 0)
            {
                var kind = plan.Due[0];
                var scheduler = scope.ServiceProvider.GetRequiredService<ISchedulerService>();
                var claim = await scheduler.ClaimAsync(kind, GenerationTrigger.Timer, null, stoppingToken);
                if (claim.Claim is null)
                {
                    logger.LogInformation("Zamanlayıcı görevi devralınamadı ({Kind}): {Message}", kind, claim.ConflictMessage);
                    return FailureDelay;
                }

                await scheduler.ExecuteAsync(claim.Claim, stoppingToken);
                return TimeSpan.FromSeconds(1);
            }

            return plan.NextWakeUtc - now;
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Zamanlayıcı adımı başarısız oldu; yeniden denenecek.");
            return FailureDelay;
        }
    }

    private async Task WaitAsync(TimeSpan delay, CancellationToken stoppingToken)
    {
        if (delay < TimeSpan.FromSeconds(1))
        {
            delay = TimeSpan.FromSeconds(1);
        }

        var cap = TimeSpan.FromHours(SchedulerOptions.MaxSleepHours);
        if (delay > cap)
        {
            delay = cap;
        }

        using var wait = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        var sleep = Task.Delay(delay, timeProvider, wait.Token);
        var woken = signals.WakeReader.WaitToReadAsync(wait.Token).AsTask();
        await Task.WhenAny(sleep, woken);
        await wait.CancelAsync();
        while (signals.WakeReader.TryRead(out _))
        {
        }

        try
        {
            await Task.WhenAll(sleep, woken);
        }
        catch (OperationCanceledException)
        {
        }

        stoppingToken.ThrowIfCancellationRequested();
    }

    private async Task ManualLoopAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var request in signals.ManualReader.ReadAllAsync(stoppingToken))
            {
                var runId = request.Claim.RunId;
                manualTasks[runId] = Task.Run(() => RunManualAsync(request, stoppingToken), CancellationToken.None);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private async Task RunManualAsync(ManualRunRequest request, CancellationToken stoppingToken)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var scheduler = scope.ServiceProvider.GetRequiredService<ISchedulerService>();
            await scheduler.ExecuteAsync(request.Claim, stoppingToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Manuel çalıştırma yürütülemedi. Çalıştırma {RunId}", request.Claim.RunId);
        }
        finally
        {
            manualTasks.TryRemove(request.Claim.RunId, out _);
            signals.Wake();
        }
    }
}
