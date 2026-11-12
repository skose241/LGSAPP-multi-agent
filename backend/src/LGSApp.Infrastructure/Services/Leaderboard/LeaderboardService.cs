using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LGSApp.Infrastructure.Services.Leaderboard;

public enum LeaderboardPeriod
{
    Weekly = 1,
    Monthly = 2
}

public sealed record LeaderboardItemView(int Rank, int UserId, string UserName, string? FullName, string? Avatar, int Points);

public sealed record LeaderboardMeView(int Rank, int Points);

public sealed record LeaderboardView(
    LeaderboardPeriod Period,
    int Offset,
    DateOnly StartDate,
    DateOnly EndDate,
    IReadOnlyList<LeaderboardItemView> Items,
    LeaderboardMeView? Me);

public interface ILeaderboardService
{
    Task<ServiceResult<LeaderboardView>> GetAsync(Actor actor, LeaderboardPeriod period, int offset, int top, CancellationToken cancellationToken = default);
}

public sealed class LeaderboardService(IServiceScopeFactory scopes, ILeaderboardCache cache, TurkeyTime clock) : ILeaderboardService
{
    public const int MaxOffset = 12;
    public const int MaxTop = 100;

    private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(60);

    private sealed record RankedRow(int Rank, int UserId, string UserName, string FullName, int Points);

    public async Task<ServiceResult<LeaderboardView>> GetAsync(Actor actor, LeaderboardPeriod period, int offset, int top, CancellationToken cancellationToken = default)
    {
        if (!Enum.IsDefined(period))
        {
            return Fail.Validation("Dönem 'weekly' veya 'monthly' olmalıdır.");
        }

        if (offset < 0 || offset > MaxOffset)
        {
            return Fail.Validation($"Dönem kaydırma değeri 0 ile {MaxOffset} arasında olmalıdır.");
        }

        if (top < 1 || top > MaxTop)
        {
            return Fail.Validation($"Listelenecek kişi sayısı 1 ile {MaxTop} arasında olmalıdır.");
        }

        var (start, end) = Resolve(period, offset, clock.Today);
        var key = $"leaderboard:{(int)period}:{start:yyyyMMdd}";
        var ranked = await cache.GetOrLoadAsync(key, CacheDuration, token => LoadAsync(start, end, token), cancellationToken);

        var items = ranked
            .Take(top)
            .Select(r => new LeaderboardItemView(r.Rank, r.UserId, r.UserName, actor.IsModerator ? r.FullName : null, null, r.Points))
            .ToList();

        LeaderboardMeView? me = null;
        if (actor.IsStudent)
        {
            var row = ranked.FirstOrDefault(r => r.UserId == actor.UserId);
            if (row is not null)
            {
                me = new LeaderboardMeView(row.Rank, row.Points);
            }
        }

        return ServiceResult<LeaderboardView>.Ok(new LeaderboardView(period, offset, start, end, items, me));
    }

    public static (DateOnly Start, DateOnly End) Resolve(LeaderboardPeriod period, int offset, DateOnly today)
    {
        if (period == LeaderboardPeriod.Weekly)
        {
            var daysFromMonday = ((int)today.DayOfWeek + 6) % 7;
            var start = today.AddDays(-daysFromMonday - 7 * offset);
            return (start, start.AddDays(6));
        }

        var first = new DateOnly(today.Year, today.Month, 1).AddMonths(-offset);
        return (first, first.AddMonths(1).AddDays(-1));
    }

    private async Task<IReadOnlyList<RankedRow>> LoadAsync(DateOnly start, DateOnly end, CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var totals = db.PointTransactions.AsNoTracking()
            .Where(p => p.LocalDate >= start && p.LocalDate <= end)
            .GroupBy(p => p.UserId)
            .Select(g => new { UserId = g.Key, Points = g.Sum(p => p.Amount) });

        var rows = await (
            from t in totals
            join u in db.Users.AsNoTracking() on t.UserId equals u.Id
            where !u.IsBanned
                && db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == Roles.OgrenciId)
            select new { u.Id, u.UserName, u.FirstName, u.LastName, t.Points })
            .ToListAsync(cancellationToken);

        var ordered = rows
            .Select(r => new { r.Id, UserName = r.UserName ?? string.Empty, FullName = $"{r.FirstName} {r.LastName}".Trim(), r.Points })
            .OrderByDescending(r => r.Points)
            .ThenBy(r => r.UserName, StringComparer.Ordinal)
            .ToList();

        var result = new List<RankedRow>(ordered.Count);
        var rank = 0;
        var previousPoints = 0;
        for (var i = 0; i < ordered.Count; i++)
        {
            if (i == 0 || ordered[i].Points != previousPoints)
            {
                rank = i + 1;
                previousPoints = ordered[i].Points;
            }

            result.Add(new RankedRow(rank, ordered[i].Id, ordered[i].UserName, ordered[i].FullName, ordered[i].Points));
        }

        return result;
    }
}
