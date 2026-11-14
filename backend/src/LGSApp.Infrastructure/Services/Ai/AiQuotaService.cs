using System.Data;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Ai;

public enum AiReservationStatus
{
    Granted = 1,
    PersonalLimit = 2,
    GlobalLimit = 3,
    Busy = 4
}

public sealed record AiReservation(AiReservationStatus Status, long LogId, int RetryAfterSeconds);

public sealed record AiQuotaSummary(int? DailyLimit, int UsedToday, int? RemainingToday);

public sealed record AiQuotaStatusView(bool Enabled, int? DailyLimit, int UsedToday, int? RemainingToday, DateTime ResetsAt);

public interface IAiQuotaService
{
    Task<AiReservation> ReserveAsync(Actor actor, int questionId, string? model, CancellationToken cancellationToken);
    Task ReleaseAsync(long logId, AiErrorKind errorKind, string? message, CancellationToken cancellationToken);
    Task DiscardAsync(long logId, CancellationToken cancellationToken);
    Task<AiQuotaSummary> GetSummaryAsync(Actor actor, CancellationToken cancellationToken);
    Task<AiQuotaStatusView> GetStatusAsync(Actor actor, CancellationToken cancellationToken);
}

public sealed class AiQuotaService(
    AppDbContext db,
    ISettingsService settings,
    IOptions<AiOptions> options,
    TurkeyTime clock) : IAiQuotaService
{
    public const string GlobalLockResource = "ai-quota:global";
    private const int LockTimeoutMs = 5000;
    private const int BusyRetrySeconds = 5;

    public static string UserLockResource(int userId) => $"ai-quota:{userId}";

    public static (DateTime FromUtc, DateTime ToUtc) DayBoundsUtc(DateTime nowUtc)
    {
        var day = TurkeyTime.ToLocalDate(nowUtc);
        return (TurkeyTime.ToUtc(day, TimeOnly.MinValue), TurkeyTime.ToUtc(day.AddDays(1), TimeOnly.MinValue));
    }

    public static int SecondsUntil(DateTime nowUtc, DateTime targetUtc) =>
        Math.Max(1, (int)Math.Ceiling((targetUtc - nowUtc).TotalSeconds));

    public async Task<AiReservation> ReserveAsync(Actor actor, int questionId, string? model, CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var (from, to) = DayBoundsUtc(now);
        var personalLimit = await PersonalLimitAsync(actor, cancellationToken);
        var globalLimit = await settings.GetIntAsync(SettingKeys.AiGunlukCozumGlobalLimit, cancellationToken);
        var untilReset = SecondsUntil(now, to);

        return await db.ExecuteInTransactionAsync(async token =>
        {
            if (!await TryLockAsync(UserLockResource(actor.UserId), token) || !await TryLockAsync(GlobalLockResource, token))
            {
                return new AiReservation(AiReservationStatus.Busy, 0, BusyRetrySeconds);
            }

            if (personalLimit is { } limit)
            {
                var used = await CountAsync(actor.UserId, from, to, token);
                if (used >= limit)
                {
                    return new AiReservation(AiReservationStatus.PersonalLimit, 0, untilReset);
                }
            }

            var globalUsed = await CountAsync(null, from, to, token);
            if (globalUsed >= globalLimit)
            {
                return new AiReservation(AiReservationStatus.GlobalLimit, 0, untilReset);
            }

            var row = new AiLog
            {
                UserId = actor.UserId,
                QuestionId = questionId,
                Operation = AiOperation.Solution,
                Model = AiCallLogger.Truncate(model, 50),
                Status = AiLogStatus.Pending,
                Success = false,
                CountsTowardLimit = true,
                CreatedAt = now
            };
            db.AiLogs.Add(row);
            await db.SaveChangesAsync(token);
            return new AiReservation(AiReservationStatus.Granted, row.Id, 0);
        }, cancellationToken);
    }

    public async Task ReleaseAsync(long logId, AiErrorKind errorKind, string? message, CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var text = AiCallLogger.Truncate(message, AiRules.ErrorMessageMaxLength);
        await db.AiLogs
            .Where(l => l.Id == logId && l.Status == AiLogStatus.Pending)
            .ExecuteUpdateAsync(
                s => s.SetProperty(l => l.Status, AiLogStatus.Failed)
                    .SetProperty(l => l.Success, false)
                    .SetProperty(l => l.ErrorKind, errorKind)
                    .SetProperty(l => l.ErrorMessage, text)
                    .SetProperty(l => l.CountsTowardLimit, false)
                    .SetProperty(l => l.CompletedAt, now),
                cancellationToken);
    }

    public async Task DiscardAsync(long logId, CancellationToken cancellationToken) =>
        await db.AiLogs
            .Where(l => l.Id == logId && l.Status == AiLogStatus.Pending)
            .ExecuteDeleteAsync(cancellationToken);

    public async Task<AiQuotaSummary> GetSummaryAsync(Actor actor, CancellationToken cancellationToken)
    {
        var (from, to) = DayBoundsUtc(clock.UtcNow);
        var limit = await PersonalLimitAsync(actor, cancellationToken);
        var used = await CountAsync(actor.UserId, from, to, cancellationToken);
        return new AiQuotaSummary(limit, used, limit is { } l ? Math.Max(0, l - used) : null);
    }

    public async Task<AiQuotaStatusView> GetStatusAsync(Actor actor, CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var (_, to) = DayBoundsUtc(now);
        var summary = await GetSummaryAsync(actor, cancellationToken);
        var active = await settings.GetIntAsync(SettingKeys.AiCozumAktifMi, cancellationToken) == 1 && options.Value.SolutionConfigured;
        var globalLimit = await settings.GetIntAsync(SettingKeys.AiGunlukCozumGlobalLimit, cancellationToken);
        var enabled = !AiAvailability.IsClosed(active, actor.IsModerator, summary.DailyLimit ?? 0, globalLimit);
        return new AiQuotaStatusView(enabled, summary.DailyLimit, summary.UsedToday, summary.RemainingToday, to);
    }

    private async Task<int?> PersonalLimitAsync(Actor actor, CancellationToken cancellationToken)
    {
        if (actor.IsModerator)
        {
            var moderatorLimit = await settings.GetIntAsync(SettingKeys.AiGunlukCozumLimitModerator, cancellationToken);
            return moderatorLimit <= 0 ? null : moderatorLimit;
        }

        return Math.Max(0, await settings.GetIntAsync(SettingKeys.AiGunlukCozumLimit, cancellationToken));
    }

    private Task<int> CountAsync(int? userId, DateTime from, DateTime to, CancellationToken cancellationToken) =>
        db.AiLogs.AsNoTracking().CountAsync(
            l => l.CountsTowardLimit
                && l.CreatedAt >= from
                && l.CreatedAt < to
                && (l.Operation == AiOperation.Solution || l.Operation == AiOperation.SolutionInvalid || l.Operation == AiOperation.AnswerMismatch)
                && (userId == null || l.UserId == userId),
            cancellationToken);

    private async Task<bool> TryLockAsync(string resource, CancellationToken cancellationToken)
    {
        var result = new SqlParameter("@result", SqlDbType.Int) { Direction = ParameterDirection.Output };
        await db.Database.ExecuteSqlRawAsync(
            $"EXEC @result = sp_getapplock @Resource = @resource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = {LockTimeoutMs}",
            [result, new SqlParameter("@resource", resource)],
            cancellationToken);
        return result.Value is int code && code >= 0;
    }
}
