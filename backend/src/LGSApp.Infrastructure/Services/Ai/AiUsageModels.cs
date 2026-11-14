using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Common;

namespace LGSApp.Infrastructure.Services.Ai;

public sealed record AiUsageRange(DateOnly From, DateOnly To, DateTime FromUtc, DateTime ToUtc, int Days);

public sealed record AiUsageGroup(
    int Bucket,
    AiOperation Operation,
    AiLogStatus Status,
    AiErrorKind ErrorKind,
    int Rows,
    int LimitConsumed,
    long InputTokens,
    long OutputTokens,
    long ThinkingTokens,
    decimal CostUsd);

public sealed record AiUsageErrorCount(AiErrorKind Kind, int Count);

public sealed record AiUsageDayRow(
    DateOnly Date,
    AiOperation Operation,
    int Calls,
    int Succeeded,
    int Failed,
    int Rejected,
    int Pending,
    decimal? SuccessRate,
    long InputTokens,
    long OutputTokens,
    long ThinkingTokens,
    decimal CostUsd,
    int LimitConsumed,
    IReadOnlyList<AiUsageErrorCount> ErrorKinds);

public sealed record AiUsageTotals(
    int Calls,
    int Succeeded,
    int Failed,
    int Rejected,
    int Pending,
    decimal? SuccessRate,
    long InputTokens,
    long OutputTokens,
    long ThinkingTokens,
    decimal CostUsd,
    int LimitConsumed,
    IReadOnlyList<AiUsageErrorCount> ErrorKinds);

public sealed record AiUsageUserGroup(int? UserId, int Calls, long InputTokens, long OutputTokens, decimal CostUsd);

public sealed record AiUsageUserRow(int? UserId, UserRefView? User, bool System, int Calls, long InputTokens, long OutputTokens, decimal CostUsd);

public sealed record AiUsageView(
    DateOnly From,
    DateOnly To,
    DateTime FromUtc,
    DateTime ToUtc,
    int Days,
    IReadOnlyList<AiUsageDayRow> ByDay,
    AiUsageTotals Totals,
    IReadOnlyList<AiUsageUserRow> ByUser);

public static class AiUsageRules
{
    public const int DefaultDays = 7;
    public const int MaxDays = 92;
    public const string InvalidOrderMessage = "Başlangıç tarihi bitiş tarihinden sonra olamaz.";
    public const string TooLongMessage = "Tarih aralığı en fazla 92 gün olabilir.";
    public const string OutOfBoundsMessage = "Tarih aralığı geçerli sınırlar dışında.";
    public static readonly DateOnly MinDate = new(2025, 1, 1);

    public static ServiceResult<AiUsageRange> Resolve(DateOnly? from, DateOnly? to, DateOnly today)
    {
        var end = to ?? today;
        var start = from ?? end.AddDays(-(DefaultDays - 1));
        var upper = today.AddDays(1);
        if (start < MinDate || end < MinDate || start > upper || end > upper)
        {
            return Fail.Validation(OutOfBoundsMessage);
        }

        if (start > end)
        {
            return Fail.Validation(InvalidOrderMessage);
        }

        var days = end.DayNumber - start.DayNumber + 1;
        if (days > MaxDays)
        {
            return Fail.Validation(TooLongMessage);
        }

        var fromUtc = TurkeyTime.ToUtc(start, TimeOnly.MinValue);
        var toUtc = TurkeyTime.ToUtc(end.AddDays(1), TimeOnly.MinValue);
        return ServiceResult<AiUsageRange>.Ok(new AiUsageRange(start, end, fromUtc, toUtc, days));
    }

    public static decimal? SuccessRate(int succeeded, int calls) =>
        calls <= 0 ? null : Math.Round((decimal)succeeded / calls, 4);

    public static (IReadOnlyList<AiUsageDayRow> Days, AiUsageTotals Totals) Aggregate(AiUsageRange range, IEnumerable<AiUsageGroup> groups)
    {
        var valid = groups.Where(g => g.Bucket >= 0 && g.Bucket < range.Days).ToList();

        var days = valid
            .GroupBy(g => (g.Bucket, g.Operation))
            .OrderBy(g => g.Key.Bucket)
            .ThenBy(g => g.Key.Operation)
            .Select(g =>
            {
                var t = Summarize(g);
                return new AiUsageDayRow(
                    range.From.AddDays(g.Key.Bucket),
                    g.Key.Operation,
                    t.Calls, t.Succeeded, t.Failed, t.Rejected, t.Pending, t.SuccessRate,
                    t.InputTokens, t.OutputTokens, t.ThinkingTokens, t.CostUsd, t.LimitConsumed, t.ErrorKinds);
            })
            .ToList();

        return (days, Summarize(valid));
    }

    private static AiUsageTotals Summarize(IEnumerable<AiUsageGroup> groups)
    {
        int succeeded = 0, failed = 0, rejected = 0, pending = 0, limit = 0;
        long input = 0, output = 0, thinking = 0;
        decimal cost = 0;
        var errors = new Dictionary<AiErrorKind, int>();

        foreach (var g in groups)
        {
            switch (g.Status)
            {
                case AiLogStatus.Pending:
                    pending += g.Rows;
                    continue;
                case AiLogStatus.Succeeded:
                    succeeded += g.Rows;
                    break;
                case AiLogStatus.Failed:
                    failed += g.Rows;
                    break;
                case AiLogStatus.Rejected:
                    rejected += g.Rows;
                    break;
            }

            limit += g.LimitConsumed;
            input += g.InputTokens;
            output += g.OutputTokens;
            thinking += g.ThinkingTokens;
            cost += g.CostUsd;
            if (g.Status != AiLogStatus.Succeeded && g.ErrorKind != AiErrorKind.None)
            {
                errors[g.ErrorKind] = errors.GetValueOrDefault(g.ErrorKind) + g.Rows;
            }
        }

        var calls = succeeded + failed + rejected;
        var errorList = errors.OrderBy(e => e.Key).Select(e => new AiUsageErrorCount(e.Key, e.Value)).ToList();
        return new AiUsageTotals(calls, succeeded, failed, rejected, pending, SuccessRate(succeeded, calls), input, output, thinking, cost, limit, errorList);
    }
}
