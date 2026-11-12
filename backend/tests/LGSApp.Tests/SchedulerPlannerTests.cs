using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Scheduler;

namespace LGSApp.Tests;

public class SchedulerPlannerTests
{
    private static readonly DateOnly Today = new(2026, 11, 12);
    private static readonly SchedulerOptions Options = new();
    private int nextId = 1;

    private static DateTime At(int hour, int minute, int second = 0, DateOnly? day = null) =>
        TurkeyTime.ToUtc(day ?? Today, new TimeOnly(hour, minute, second));

    private RunInfo Run(
        GenerationKind kind,
        GenerationRunStatus status,
        DateTime startedAt,
        DateTime? finishedAt,
        int succeeded = 0,
        GenerationTrigger trigger = GenerationTrigger.Timer) =>
        new(nextId++, kind, trigger, status, startedAt, finishedAt, startedAt.AddMinutes(3), succeeded);

    private RunInfo AssignmentsDone() =>
        Run(GenerationKind.CloseAssignments, GenerationRunStatus.Succeeded, At(0, 5), At(0, 5, 2));

    [Fact]
    public void Before_generate_time_nothing_is_due_and_wakes_at_generate_time()
    {
        var plan = SchedulerPlanner.Plan(Options, At(14, 0), Today, [AssignmentsDone()]);

        Assert.Empty(plan.Due);
        Assert.Equal(At(17, 30), plan.NextWakeUtc);
    }

    [Fact]
    public void At_generate_time_generate_is_due()
    {
        var plan = SchedulerPlanner.Plan(Options, At(17, 30), Today, [AssignmentsDone()]);

        Assert.Equal([GenerationKind.Generate], plan.Due);
    }

    [Fact]
    public void Late_start_runs_generate_first_then_complete_after_gap()
    {
        var now = At(18, 30);
        var first = SchedulerPlanner.Plan(Options, now, Today, [AssignmentsDone()]);
        Assert.Contains(GenerationKind.Generate, first.Due);
        Assert.DoesNotContain(GenerationKind.Complete, first.Due);

        var generate = Run(GenerationKind.Generate, GenerationRunStatus.PartiallySucceeded, At(18, 30), At(18, 31), 3);
        var afterGenerate = SchedulerPlanner.Plan(Options, At(18, 40), Today, [AssignmentsDone(), generate]);
        Assert.DoesNotContain(GenerationKind.Complete, afterGenerate.Due);
        Assert.Equal(At(18, 46), afterGenerate.NextWakeUtc);

        var later = SchedulerPlanner.Plan(Options, At(18, 46), Today, [AssignmentsDone(), generate]);
        Assert.Contains(GenerationKind.Complete, later.Due);
    }

    [Fact]
    public void Open_after_catch_up_window_skips_generate_but_publishes()
    {
        var plan = SchedulerPlanner.Plan(Options, At(23, 30), Today, [AssignmentsDone()]);

        Assert.DoesNotContain(GenerationKind.Generate, plan.Due);
        Assert.DoesNotContain(GenerationKind.Complete, plan.Due);
        Assert.Contains(GenerationKind.Publish, plan.Due);
    }

    [Fact]
    public void Failed_generate_counts_as_done_and_is_not_repeated()
    {
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Failed, At(17, 30), At(17, 31));
        var plan = SchedulerPlanner.Plan(Options, At(17, 50), Today, [AssignmentsDone(), generate]);

        Assert.DoesNotContain(GenerationKind.Generate, plan.Due);
    }

    [Fact]
    public void Interrupted_generate_is_retried_after_delay()
    {
        var interrupted = Run(GenerationKind.Generate, GenerationRunStatus.Interrupted, At(17, 30), At(17, 40));

        var early = SchedulerPlanner.Plan(Options, At(17, 45), Today, [AssignmentsDone(), interrupted]);
        Assert.DoesNotContain(GenerationKind.Generate, early.Due);
        Assert.Equal(At(17, 50), early.NextWakeUtc);

        var ready = SchedulerPlanner.Plan(Options, At(17, 50), Today, [AssignmentsDone(), interrupted]);
        Assert.Contains(GenerationKind.Generate, ready.Due);
    }

    [Fact]
    public void Timer_attempts_are_capped_per_day()
    {
        var runs = new List<RunInfo> { AssignmentsDone() };
        for (var i = 0; i < 3; i++)
        {
            runs.Add(Run(GenerationKind.Generate, GenerationRunStatus.Interrupted, At(17, 30 + i * 12), At(17, 35 + i * 12)));
        }

        var plan = SchedulerPlanner.Plan(Options, At(20, 0), Today, runs);

        Assert.DoesNotContain(GenerationKind.Generate, plan.Due);
    }

    [Fact]
    public void Manual_runs_do_not_consume_timer_attempts()
    {
        var runs = new List<RunInfo> { AssignmentsDone() };
        for (var i = 0; i < 3; i++)
        {
            runs.Add(Run(GenerationKind.Generate, GenerationRunStatus.Interrupted, At(17, 30 + i * 12), At(17, 35 + i * 12), trigger: GenerationTrigger.Manual));
        }

        var plan = SchedulerPlanner.Plan(Options, At(20, 0), Today, runs);

        Assert.Contains(GenerationKind.Generate, plan.Due);
    }

    [Fact]
    public void Publish_waits_while_production_is_running_then_gives_up()
    {
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Succeeded, At(17, 30), At(17, 50), 3);
        var complete = Run(GenerationKind.Complete, GenerationRunStatus.Running, At(18, 55), null);
        var runs = new[] { AssignmentsDone(), generate, complete };

        var waiting = SchedulerPlanner.Plan(Options, At(19, 0), Today, runs);
        Assert.DoesNotContain(GenerationKind.Publish, waiting.Due);
        Assert.Equal(At(19, 2), waiting.NextWakeUtc);

        var expired = SchedulerPlanner.Plan(Options, At(19, 31), Today, runs);
        Assert.Contains(GenerationKind.Publish, expired.Due);
    }

    [Fact]
    public void Late_production_triggers_a_second_publish()
    {
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Succeeded, At(17, 30), At(17, 50), 3);
        var publish = Run(GenerationKind.Publish, GenerationRunStatus.Succeeded, At(19, 0), At(19, 0, 5), 3);
        var complete = Run(GenerationKind.Complete, GenerationRunStatus.Succeeded, At(19, 10), At(19, 12), 2);

        var before = SchedulerPlanner.Plan(Options, At(19, 5), Today, [AssignmentsDone(), generate, publish]);
        Assert.DoesNotContain(GenerationKind.Publish, before.Due);

        var after = SchedulerPlanner.Plan(Options, At(19, 13), Today, [AssignmentsDone(), generate, publish, complete]);
        Assert.Contains(GenerationKind.Publish, after.Due);
    }

    [Fact]
    public void Empty_production_does_not_trigger_second_publish()
    {
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Succeeded, At(17, 30), At(17, 50), 3);
        var publish = Run(GenerationKind.Publish, GenerationRunStatus.Succeeded, At(19, 0), At(19, 0, 5), 3);
        var complete = Run(GenerationKind.Complete, GenerationRunStatus.Succeeded, At(19, 10), At(19, 12), 0);

        var plan = SchedulerPlanner.Plan(Options, At(19, 13), Today, [AssignmentsDone(), generate, publish, complete]);

        Assert.DoesNotContain(GenerationKind.Publish, plan.Due);
    }

    [Fact]
    public void Assignments_are_due_until_a_success_exists_and_wake_at_next_midnight_window()
    {
        var none = SchedulerPlanner.Plan(Options, At(0, 6), Today, []);
        Assert.Contains(GenerationKind.CloseAssignments, none.Due);

        var runs = new List<RunInfo>
        {
            AssignmentsDone(),
            Run(GenerationKind.Generate, GenerationRunStatus.Succeeded, At(17, 30), At(17, 50)),
            Run(GenerationKind.Complete, GenerationRunStatus.Succeeded, At(18, 15), At(18, 20)),
            Run(GenerationKind.Publish, GenerationRunStatus.Succeeded, At(19, 0), At(19, 1))
        };
        var night = SchedulerPlanner.Plan(Options, At(23, 59, 30), Today, runs);

        Assert.Empty(night.Due);
        Assert.Equal(At(0, 5, day: Today.AddDays(1)), night.NextWakeUtc);
    }

    [Fact]
    public void Sleep_is_capped_at_six_hours()
    {
        var now = At(0, 10);

        var plan = SchedulerPlanner.Plan(Options, now, Today, [AssignmentsDone()]);

        Assert.Empty(plan.Due);
        Assert.Equal(now.AddHours(SchedulerOptions.MaxSleepHours), plan.NextWakeUtc);
    }

    [Fact]
    public void Running_group_blocks_generate_and_wakes_after_lease()
    {
        var running = Run(GenerationKind.Generate, GenerationRunStatus.Running, At(17, 30), null);
        var plan = SchedulerPlanner.Plan(Options, At(17, 31), Today, [AssignmentsDone(), running]);

        Assert.DoesNotContain(GenerationKind.Generate, plan.Due);
        Assert.DoesNotContain(GenerationKind.Complete, plan.Due);
        Assert.True(plan.NextWakeUtc <= running.LeaseUntil.AddSeconds(1));
    }

    [Fact]
    public void Due_jobs_are_ordered_assignments_generate_complete_publish()
    {
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Succeeded, At(17, 30), At(17, 31), 1);
        var plan = SchedulerPlanner.Plan(Options, At(19, 30), Today, [generate]);

        Assert.Equal([GenerationKind.CloseAssignments, GenerationKind.Complete, GenerationKind.Publish], plan.Due);
    }
}
