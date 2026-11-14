using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Scheduler;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Ai;

public sealed record AiGateStatusView(AiKeyPurpose Purpose, bool Tripped, AiErrorKind? Kind, string? Reason, DateTime? Until, int? RetryAfterSeconds);

public sealed record AiAdminStatusView(
    AiProvider Provider,
    bool QuestionConfigured,
    bool SolutionConfigured,
    bool AiConfigured,
    bool VerificationEnabled,
    bool AiCozumAktifMi,
    string? QuestionModel,
    string? SolutionModel,
    IReadOnlyList<AiGateStatusView> Gates,
    int TodayGlobalUsed,
    int GlobalLimit,
    DateTime QuotaResetsAt);

public interface IAiAdminService
{
    Task<ServiceResult<AiUsageView>> GetUsageAsync(DateOnly? from, DateOnly? to, CancellationToken cancellationToken);
    Task<AiAdminStatusView> GetStatusAsync(CancellationToken cancellationToken);
}

public sealed class AiAdminService(
    AppDbContext db,
    UserLookupService users,
    ISettingsService settings,
    IAiQuotaService quota,
    IQuestionGenerator generator,
    IQuestionVerifier verifier,
    AiProviderGate gate,
    IOptions<AiOptions> options,
    TurkeyTime clock) : IAiAdminService
{
    public static string? GateReason(AiErrorKind kind) => kind switch
    {
        AiErrorKind.QuotaExhausted => AiMessages.GateQuotaExhausted,
        AiErrorKind.AuthFailed => AiMessages.GateAuthFailed,
        _ => null
    };

    public static IQueryable<AiUsageGroup> GroupQuery(AppDbContext db, DateTime fromUtc, DateTime toUtc) =>
        db.AiLogs.AsNoTracking()
            .Where(l => l.CreatedAt >= fromUtc && l.CreatedAt < toUtc)
            .GroupBy(l => new
            {
                Bucket = EF.Functions.DateDiffHour(fromUtc, l.CreatedAt) / 24,
                l.Operation,
                l.Status,
                l.ErrorKind
            })
            .Select(g => new AiUsageGroup(
                g.Key.Bucket,
                g.Key.Operation,
                g.Key.Status,
                g.Key.ErrorKind,
                g.Count(),
                g.Count(l => l.CountsTowardLimit),
                g.Sum(l => (long)(l.InputTokens ?? 0)),
                g.Sum(l => (long)(l.OutputTokens ?? 0)),
                g.Sum(l => (long)(l.ThinkingTokens ?? 0)),
                g.Sum(l => l.CostUsd ?? 0m)));

    public static IQueryable<AiUsageUserGroup> UserQuery(AppDbContext db, DateTime fromUtc, DateTime toUtc) =>
        db.AiLogs.AsNoTracking()
            .Where(l => l.CreatedAt >= fromUtc && l.CreatedAt < toUtc && l.Status != AiLogStatus.Pending)
            .GroupBy(l => l.UserId)
            .Select(g => new AiUsageUserGroup(
                g.Key,
                g.Count(),
                g.Sum(l => (long)(l.InputTokens ?? 0)),
                g.Sum(l => (long)(l.OutputTokens ?? 0)),
                g.Sum(l => l.CostUsd ?? 0m)));

    public async Task<ServiceResult<AiUsageView>> GetUsageAsync(DateOnly? from, DateOnly? to, CancellationToken cancellationToken)
    {
        var resolved = AiUsageRules.Resolve(from, to, clock.Today);
        if (!resolved.Succeeded)
        {
            return ServiceResult<AiUsageView>.From(resolved);
        }

        var range = resolved.Value!;
        var fromUtc = range.FromUtc;
        var toUtc = range.ToUtc;

        var groups = await GroupQuery(db, fromUtc, toUtc).ToListAsync(cancellationToken);
        var userGroups = await UserQuery(db, fromUtc, toUtc).ToListAsync(cancellationToken);

        var (days, totals) = AiUsageRules.Aggregate(range, groups);

        var people = await users.GetAsync(userGroups.Where(u => u.UserId.HasValue).Select(u => u.UserId!.Value), true, cancellationToken);
        var byUser = userGroups
            .Select(u => new AiUsageUserRow(
                u.UserId,
                u.UserId is { } id && people.TryGetValue(id, out var person) ? person : null,
                u.UserId is null,
                u.Calls,
                u.InputTokens,
                u.OutputTokens,
                u.CostUsd))
            .OrderByDescending(u => u.CostUsd)
            .ThenByDescending(u => u.Calls)
            .ThenBy(u => u.UserId)
            .ToList();

        return ServiceResult<AiUsageView>.Ok(new AiUsageView(range.From, range.To, range.FromUtc, range.ToUtc, range.Days, days, totals, byUser));
    }

    public async Task<AiAdminStatusView> GetStatusAsync(CancellationToken cancellationToken)
    {
        var o = options.Value;
        var now = clock.UtcNow;
        var verificationEnabled = await verifier.IsEnabledAsync(cancellationToken);
        var aiConfigured = SchedulerQueryService.ComputeAiConfigured(generator.IsConfigured, verificationEnabled, o.SolutionConfigured);
        var solutionActive = await settings.GetIntAsync(SettingKeys.AiCozumAktifMi, cancellationToken) == 1;
        var globalLimit = await settings.GetIntAsync(SettingKeys.AiGunlukCozumGlobalLimit, cancellationToken);
        var globalUsed = await quota.GetGlobalUsedTodayAsync(cancellationToken);
        var (_, resetsAt) = AiQuotaService.DayBoundsUtc(now);

        var gates = new[] { AiKeyPurpose.Question, AiKeyPurpose.Solution }
            .Select(purpose =>
            {
                var state = gate.Check(purpose);
                return state is { } s
                    ? new AiGateStatusView(purpose, true, s.Kind, GateReason(s.Kind), now.AddSeconds(s.RetryAfterSeconds), s.RetryAfterSeconds)
                    : new AiGateStatusView(purpose, false, null, null, null, null);
            })
            .ToList();

        return new AiAdminStatusView(
            o.Provider,
            o.QuestionConfigured,
            o.SolutionConfigured,
            aiConfigured,
            verificationEnabled,
            solutionActive,
            NullIfEmpty(o.Question.Model),
            NullIfEmpty(o.Solution.Model),
            gates,
            globalUsed,
            globalLimit,
            resetsAt);
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
