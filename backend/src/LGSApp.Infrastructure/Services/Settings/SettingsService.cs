using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace LGSApp.Infrastructure.Services.Settings;

public interface ISettingsService
{
    Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default);
    void Invalidate();
}

public sealed class SettingsService(AppDbContext db, IMemoryCache cache) : ISettingsService
{
    private const string CacheKey = "settings:all";
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(5);
    private static readonly Dictionary<string, int> Fallbacks = SettingKeys.Defaults.ToDictionary(d => d.Key, d => d.Value);

    public async Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default)
    {
        var all = await LoadAsync(cancellationToken);
        if (all.TryGetValue(key, out var raw) && int.TryParse(raw, out var value))
        {
            return value;
        }

        return Fallbacks.TryGetValue(key, out var fallback) ? fallback : 0;
    }

    public void Invalidate() => cache.Remove(CacheKey);

    private async Task<IReadOnlyDictionary<string, string>> LoadAsync(CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(CacheKey, out IReadOnlyDictionary<string, string>? cached) && cached is not null)
        {
            return cached;
        }

        var loaded = await db.Settings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value, cancellationToken);
        cache.Set(CacheKey, (IReadOnlyDictionary<string, string>)loaded, Ttl);
        return loaded;
    }
}
