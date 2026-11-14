using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Common;

namespace LGSApp.Infrastructure.Services.Scheduler;

public sealed record RunInfo(
    int Id,
    GenerationKind Kind,
    GenerationTrigger Trigger,
    GenerationRunStatus Status,
    DateTime StartedAt,
    DateTime? FinishedAt,
    DateTime LeaseUntil,
    int SucceededCount);

public sealed record SchedulerPlan(IReadOnlyList<GenerationKind> Due, DateTime NextWakeUtc);

public static class SchedulerPlanner
{
    private static readonly TimeSpan PublishWaitStep = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan MinLookahead = TimeSpan.FromSeconds(1);

    public static DateTime ScheduledAtUtc(SchedulerOptions o, GenerationKind kind, DateOnly day) =>
        TurkeyTime.ToUtc(day, kind switch
        {
            GenerationKind.Generate => o.GenerateTime,
            GenerationKind.Complete => o.CompleteTime,
            GenerationKind.Publish => o.PublishTime,
            _ => o.AssignmentsTime
        });

    public static SchedulerPlan Plan(SchedulerOptions o, DateTime nowUtc, DateOnly today, IReadOnlyList<RunInfo> runs)
    {
        var due = new List<GenerationKind>();
        var candidates = new List<DateTime>();
        var retry = TimeSpan.FromMinutes(o.RetryDelayMinutes);

        var assignmentsAt = ScheduledAtUtc(o, GenerationKind.CloseAssignments, today);
        var generateAt = ScheduledAtUtc(o, GenerationKind.Generate, today);
        var completeAt = ScheduledAtUtc(o, GenerationKind.Complete, today);
        var publishAt = ScheduledAtUtc(o, GenerationKind.Publish, today);
        var catchUpUntil = TurkeyTime.ToUtc(today, o.CatchUpUntilTime);

        var generationGroupRunning = runs.Where(r => r.Status == GenerationRunStatus.Running && IsProduction(r.Kind)).ToList();
        var generationGroupBusy = generationGroupRunning.Count > 0;

        Evaluate(GenerationKind.CloseAssignments, assignmentsAt, IsDoneBySuccess(runs, GenerationKind.CloseAssignments), true, false);

        var generateDone = IsDoneByFinish(runs, GenerationKind.Generate);
        Evaluate(GenerationKind.Generate, generateAt, generateDone, nowUtc <= catchUpUntil, generationGroupBusy);

        var generateFinished = runs
            .Where(r => r.Kind == GenerationKind.Generate && r.Status is not (GenerationRunStatus.Running or GenerationRunStatus.Interrupted) && r.FinishedAt is not null)
            .OrderByDescending(r => r.FinishedAt)
            .FirstOrDefault();

        if (generateFinished is not null)
        {
            var completeEarliest = Max(completeAt, generateFinished.FinishedAt!.Value.AddMinutes(o.CompleteMinGapMinutes));
            Evaluate(GenerationKind.Complete, completeEarliest, IsDoneByFinish(runs, GenerationKind.Complete), nowUtc <= catchUpUntil, generationGroupBusy);
        }
        else if (!generateDone && nowUtc <= catchUpUntil)
        {
            candidates.Add(Max(completeAt, generateAt.AddMinutes(o.CompleteMinGapMinutes)));
        }

        var lastPublish = runs
            .Where(r => r.Kind == GenerationKind.Publish && r.Status is GenerationRunStatus.Succeeded or GenerationRunStatus.PartiallySucceeded && r.FinishedAt is not null)
            .OrderByDescending(r => r.FinishedAt)
            .FirstOrDefault();

        var lateProduction = runs.Any(r =>
            IsProduction(r.Kind)
            && r.Status is GenerationRunStatus.Succeeded or GenerationRunStatus.PartiallySucceeded
            && r.SucceededCount > 0
            && r.FinishedAt is not null
            && (lastPublish is null || r.FinishedAt > lastPublish.FinishedAt));

        if (lastPublish is null || lateProduction)
        {
            var publishWaiting = generationGroupBusy && nowUtc < publishAt.AddMinutes(o.PublishWaitMaxMinutes);
            Evaluate(GenerationKind.Publish, publishAt, false, true, publishWaiting);
            if (publishWaiting && nowUtc >= publishAt)
            {
                candidates.Add(nowUtc + PublishWaitStep);
            }
        }

        foreach (var running in runs.Where(r => r.Status == GenerationRunStatus.Running))
        {
            candidates.Add(running.LeaseUntil.AddSeconds(1));
        }

        candidates.Add(ScheduledAtUtc(o, GenerationKind.CloseAssignments, today.AddDays(1)));

        var cap = nowUtc + TimeSpan.FromHours(SchedulerOptions.MaxSleepHours);
        var next = candidates.Where(c => c > nowUtc).DefaultIfEmpty(cap).Min();
        if (next > cap)
        {
            next = cap;
        }

        if (next < nowUtc + MinLookahead)
        {
            next = nowUtc + MinLookahead;
        }

        return new SchedulerPlan(Order(due), next);

        void Evaluate(GenerationKind kind, DateTime earliest, bool done, bool windowOpen, bool blocked)
        {
            if (done)
            {
                return;
            }

            if (runs.Count(r => r.Kind == kind && r.Trigger == GenerationTrigger.Timer) >= o.MaxTimerAttemptsPerDay)
            {
                return;
            }

            var ready = earliest;
            var lastFailure = runs
                .Where(r => r.Kind == kind && r.Status is GenerationRunStatus.Failed or GenerationRunStatus.Interrupted or GenerationRunStatus.PartiallySucceeded && r.FinishedAt is not null)
                .Select(r => r.FinishedAt!.Value)
                .DefaultIfEmpty()
                .Max();
            if (lastFailure != default)
            {
                ready = Max(ready, lastFailure + retry);
            }

            if (nowUtc < ready)
            {
                candidates.Add(ready);
                return;
            }

            var sameKindRunning = runs.Any(r => r.Kind == kind && r.Status == GenerationRunStatus.Running);
            if (windowOpen && !blocked && !sameKindRunning)
            {
                due.Add(kind);
            }
        }
    }

    private static bool IsProduction(GenerationKind kind) => kind is GenerationKind.Generate or GenerationKind.Complete;

    private static bool IsDoneByFinish(IReadOnlyList<RunInfo> runs, GenerationKind kind) =>
        runs.Any(r => r.Kind == kind && (kind == GenerationKind.Generate
            ? r.Status is GenerationRunStatus.Succeeded or GenerationRunStatus.PartiallySucceeded
            : r.Status == GenerationRunStatus.Succeeded));

    private static bool IsDoneBySuccess(IReadOnlyList<RunInfo> runs, GenerationKind kind) =>
        runs.Any(r => r.Kind == kind && r.Status is GenerationRunStatus.Succeeded or GenerationRunStatus.PartiallySucceeded);

    private static IReadOnlyList<GenerationKind> Order(List<GenerationKind> due) =>
        due.OrderBy(k => k switch
        {
            GenerationKind.CloseAssignments => 0,
            GenerationKind.Generate => 1,
            GenerationKind.Complete => 2,
            _ => 3
        }).ToList();

    private static DateTime Max(DateTime a, DateTime b) => a > b ? a : b;
}
