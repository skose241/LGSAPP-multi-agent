using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LGSApp.Infrastructure.Services.Ai;

public interface IAiPendingCleanupService
{
    Task<int> RunAsync(CancellationToken cancellationToken = default);
}

public sealed class AiPendingCleanupService(AppDbContext db, TurkeyTime clock) : IAiPendingCleanupService
{
    public async Task<int> RunAsync(CancellationToken cancellationToken = default)
    {
        var now = clock.UtcNow;
        var cutoff = now.AddMinutes(-AiRules.PendingOrphanMinutes);
        return await db.AiLogs
            .Where(l => l.Status == AiLogStatus.Pending && l.CreatedAt < cutoff)
            .ExecuteUpdateAsync(
                s => s.SetProperty(l => l.Status, AiLogStatus.Failed)
                    .SetProperty(l => l.Success, false)
                    .SetProperty(l => l.ErrorKind, AiErrorKind.Canceled)
                    .SetProperty(l => l.ErrorMessage, AiMessages.OrphanReleased)
                    .SetProperty(l => l.CountsTowardLimit, false)
                    .SetProperty(l => l.CompletedAt, now),
                cancellationToken);
    }
}

public sealed class AiPendingCleanupStartup(IServiceScopeFactory scopes, ILogger<AiPendingCleanupStartup> logger) : IHostedService
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(20);

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(Timeout);
            using var scope = scopes.CreateScope();
            var released = await scope.ServiceProvider.GetRequiredService<IAiPendingCleanupService>().RunAsync(timeout.Token);
            if (released > 0)
            {
                logger.LogInformation("Açılışta {Count} yetim yapay zekâ rezervasyonu iade edildi.", released);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(ex, "Açılışta yetim yapay zekâ rezervasyonları temizlenemedi.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
