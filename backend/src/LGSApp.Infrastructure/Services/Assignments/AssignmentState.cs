using System.Linq.Expressions;
using LGSApp.Domain.Entities;

namespace LGSApp.Infrastructure.Services.Assignments;

public enum AssignmentEffectiveState : byte
{
    Draft = 0,
    Scheduled = 1,
    Open = 2,
    Closed = 3
}

public static class AssignmentState
{
    public static AssignmentEffectiveState Compute(AssignmentStatus status, DateOnly startDate, DateOnly endDate, DateOnly today)
    {
        if (status == AssignmentStatus.Draft)
        {
            return AssignmentEffectiveState.Draft;
        }

        if (status == AssignmentStatus.Closed || today > endDate)
        {
            return AssignmentEffectiveState.Closed;
        }

        return today < startDate ? AssignmentEffectiveState.Scheduled : AssignmentEffectiveState.Open;
    }

    public static Expression<Func<Assignment, bool>> Is(AssignmentEffectiveState state, DateOnly today) => state switch
    {
        AssignmentEffectiveState.Draft => a => a.Status == AssignmentStatus.Draft,
        AssignmentEffectiveState.Scheduled => a => (a.Status == AssignmentStatus.Scheduled || a.Status == AssignmentStatus.Published)
            && today < a.StartDate
            && today <= a.EndDate,
        AssignmentEffectiveState.Open => a => (a.Status == AssignmentStatus.Scheduled || a.Status == AssignmentStatus.Published)
            && a.StartDate <= today
            && today <= a.EndDate,
        _ => a => a.Status == AssignmentStatus.Closed
            || ((a.Status == AssignmentStatus.Scheduled || a.Status == AssignmentStatus.Published) && today > a.EndDate)
    };

    public static IQueryable<Assignment> WhereState(this IQueryable<Assignment> query, AssignmentEffectiveState state, DateOnly today) =>
        query.Where(Is(state, today));

    public static bool TryParse(string? value, out AssignmentEffectiveState state)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "draft":
                state = AssignmentEffectiveState.Draft;
                return true;
            case "scheduled":
                state = AssignmentEffectiveState.Scheduled;
                return true;
            case "open":
                state = AssignmentEffectiveState.Open;
                return true;
            case "closed":
                state = AssignmentEffectiveState.Closed;
                return true;
            default:
                state = default;
                return false;
        }
    }
}
