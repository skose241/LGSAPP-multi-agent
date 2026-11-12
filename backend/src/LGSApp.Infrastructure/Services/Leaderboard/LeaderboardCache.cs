using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Primitives;

namespace LGSApp.Infrastructure.Services.Leaderboard;

public interface ILeaderboardCache
{
    Task<T> GetOrLoadAsync<T>(string key, TimeSpan duration, Func<CancellationToken, Task<T>> loader, CancellationToken cancellationToken);
    void Invalidate();
}

public sealed class LeaderboardCache(IMemoryCache cache) : ILeaderboardCache
{
    private static readonly TimeSpan LoadTimeout = TimeSpan.FromSeconds(30);

    private readonly object gate = new();
    private CancellationTokenSource version = new();

    public async Task<T> GetOrLoadAsync<T>(string key, TimeSpan duration, Func<CancellationToken, Task<T>> loader, CancellationToken cancellationToken)
    {
        Lazy<Task<T>> lazy;
        lock (gate)
        {
            if (!cache.TryGetValue(key, out Lazy<Task<T>>? existing) || existing is null)
            {
                var created = default(Lazy<Task<T>>);
                created = new Lazy<Task<T>>(() => RunAsync(key, loader, () => created!));
                var options = new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = duration };
                options.AddExpirationToken(new CancellationChangeToken(version.Token));
                cache.Set(key, created, options);
                existing = created;
            }

            lazy = existing;
        }

        return await lazy.Value.WaitAsync(cancellationToken);
    }

    public void Invalidate()
    {
        CancellationTokenSource previous;
        lock (gate)
        {
            previous = version;
            version = new CancellationTokenSource();
        }

        previous.Cancel();
        previous.Dispose();
    }

    private async Task<T> RunAsync<T>(string key, Func<CancellationToken, Task<T>> loader, Func<Lazy<Task<T>>> self)
    {
        using var timeout = new CancellationTokenSource(LoadTimeout);
        try
        {
            await Task.Yield();
            return await loader(timeout.Token);
        }
        catch
        {
            lock (gate)
            {
                if (cache.TryGetValue(key, out Lazy<Task<T>>? current) && ReferenceEquals(current, self()))
                {
                    cache.Remove(key);
                }
            }

            throw;
        }
    }
}
