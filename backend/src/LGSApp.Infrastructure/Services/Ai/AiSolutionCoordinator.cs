using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LGSApp.Infrastructure.Services.Ai;

public enum AiProductionKind
{
    Created = 1,
    UnderReview = 2,
    Unreadable = 3,
    Unreliable = 4,
    Duplicate = 5,
    ProviderFailure = 6
}

public sealed record AiProduction(AiProductionKind Kind, int? SolutionId = null, int? RetryAfterSeconds = null);

public sealed class AiSolutionCoordinator(
    IServiceScopeFactory scopes,
    IHostApplicationLifetime lifetime,
    ILogger<AiSolutionCoordinator> logger)
{
    private readonly ConcurrentDictionary<int, Lazy<Task<AiProduction>>> running = new();

    public int RunningCount => running.Count;

    public Task<AiProduction>? TryJoin(int questionId) =>
        running.TryGetValue(questionId, out var existing) ? existing.Value : null;

    public (Task<AiProduction> Task, bool Started) GetOrStart(int questionId, Func<IServiceProvider, CancellationToken, Task<AiProduction>> work)
    {
        Lazy<Task<AiProduction>>? mine = null;
        mine = new Lazy<Task<AiProduction>>(() => Task.Run(() => RunAsync(questionId, work, mine!)));
        var stored = running.GetOrAdd(questionId, mine);
        return (stored.Value, ReferenceEquals(stored, mine));
    }

    private async Task<AiProduction> RunAsync(int questionId, Func<IServiceProvider, CancellationToken, Task<AiProduction>> work, Lazy<Task<AiProduction>> self)
    {
        try
        {
            using var scope = scopes.CreateScope();
            return await work(scope.ServiceProvider, lifetime.ApplicationStopping);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Yapay zekâ çözüm üretimi beklenmeyen bir hatayla bitti. Soru: {QuestionId}", questionId);
            throw;
        }
        finally
        {
            running.TryRemove(new KeyValuePair<int, Lazy<Task<AiProduction>>>(questionId, self));
        }
    }
}
