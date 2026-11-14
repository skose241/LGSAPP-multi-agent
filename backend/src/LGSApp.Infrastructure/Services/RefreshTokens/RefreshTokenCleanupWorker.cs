using LGSApp.Infrastructure.Options;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.RefreshTokens;

public sealed class RefreshTokenCleanupWorker(
    IServiceScopeFactory scopes,
    IOptions<RefreshTokenOptions> options,
    ILogger<RefreshTokenCleanupWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.CleanupEnabled)
        {
            return;
        }

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(Math.Max(1, options.Value.CleanupIntervalMinutes)));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    var deleted = await scope.ServiceProvider.GetRequiredService<IRefreshTokenService>().CleanupAsync(stoppingToken);
                    if (deleted > 0)
                    {
                        logger.LogInformation("Süresi dolan yenileme anahtarı satırı silindi: {Count}", deleted);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Yenileme anahtarı temizliği başarısız oldu.");
                }
            }
        }
        catch (OperationCanceledException)
        {
        }
    }
}
