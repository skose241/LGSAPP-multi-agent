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
    public void Failed_generate_is_not_retried_before_delay_and_is_retried_after()
    {
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Failed, At(17, 30), At(17, 31));

        var early = SchedulerPlanner.Plan(Options, At(17, 35), Today, [AssignmentsDone(), generate]);
        Assert.DoesNotContain(GenerationKind.Generate, early.Due);
        Assert.Equal(At(17, 41), early.NextWakeUtc);

        var ready = SchedulerPlanner.Plan(Options, At(17, 41), Today, [AssignmentsDone(), generate]);
        Assert.Contains(GenerationKind.Generate, ready.Due);
    }

    [Fact]
    public void Failed_generate_stops_after_max_timer_attempts()
    {
        var runs = new List<RunInfo> { AssignmentsDone() };
        for (var i = 0; i < Options.MaxTimerAttemptsPerDay; i++)
        {
            runs.Add(Run(GenerationKind.Generate, GenerationRunStatus.Failed, At(17, 30 + i * 12), At(17, 31 + i * 12)));
        }

        var plan = SchedulerPlanner.Plan(Options, At(20, 0), Today, runs);

        Assert.DoesNotContain(GenerationKind.Generate, plan.Due);
    }

    [Fact]
    public void Failed_generate_is_not_retried_after_catch_up_limit()
    {
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Failed, At(22, 40), At(22, 41));

        var plan = SchedulerPlanner.Plan(Options, At(23, 1), Today, [AssignmentsDone(), generate]);

        Assert.DoesNotContain(GenerationKind.Generate, plan.Due);
    }

    [Fact]
    public void Failed_generate_attempts_reset_on_next_day()
    {
        var tomorrow = Today.AddDays(1);
        var plan = SchedulerPlanner.Plan(Options, At(17, 30, day: tomorrow), tomorrow, []);

        Assert.Contains(GenerationKind.Generate, plan.Due);
    }

    [Fact]
    public void Partially_succeeded_generate_is_left_to_complete()
    {
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.PartiallySucceeded, At(17, 30), At(17, 40), 3);

        var plan = SchedulerPlanner.Plan(Options, At(18, 0), Today, [AssignmentsDone(), generate]);

        Assert.DoesNotContain(GenerationKind.Generate, plan.Due);
        Assert.DoesNotContain(GenerationKind.Complete, plan.Due);
        var atComplete = SchedulerPlanner.Plan(Options, At(18, 15), Today, [AssignmentsDone(), generate]);
        Assert.Contains(GenerationKind.Complete, atComplete.Due);
    }

    [Theory]
    [InlineData(GenerationRunStatus.Failed)]
    [InlineData(GenerationRunStatus.PartiallySucceeded)]
    public void Unsuccessful_complete_is_retried_after_delay(GenerationRunStatus status)
    {
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Succeeded, At(17, 30), At(17, 40), 3);
        var complete = Run(GenerationKind.Complete, status, At(18, 15), At(18, 20), 1);
        var runs = new[] { AssignmentsDone(), generate, complete };

        var early = SchedulerPlanner.Plan(Options, At(18, 25), Today, runs);
        Assert.DoesNotContain(GenerationKind.Complete, early.Due);
        Assert.Equal(At(18, 30), early.NextWakeUtc);

        var ready = SchedulerPlanner.Plan(Options, At(18, 30), Today, runs);
        Assert.Contains(GenerationKind.Complete, ready.Due);
    }

    [Fact]
    public void Complete_stops_after_max_attempts_and_after_catch_up_limit()
    {
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Succeeded, At(17, 30), At(17, 40), 3);
        var runs = new List<RunInfo> { AssignmentsDone(), generate };
        for (var i = 0; i < Options.MaxTimerAttemptsPerDay; i++)
        {
            runs.Add(Run(GenerationKind.Complete, GenerationRunStatus.Failed, At(18, 15 + i * 12), At(18, 16 + i * 12)));
        }

        Assert.DoesNotContain(GenerationKind.Complete, SchedulerPlanner.Plan(Options, At(20, 0), Today, runs).Due);

        var oneFailure = new[] { AssignmentsDone(), generate, Run(GenerationKind.Complete, GenerationRunStatus.Failed, At(22, 40), At(22, 41)) };
        Assert.DoesNotContain(GenerationKind.Complete, SchedulerPlanner.Plan(Options, At(23, 5), Today, oneFailure).Due);
    }

    [Fact]
    public void Interrupted_generate_is_retried_after_delay()
    {
        var interrupted = Run(GenerationKind.Generate, GenerationRunStatus.Interrupted, At(17, 30), At(17, 40));

        var early = SchedulerPlanner.Plan(Options, At(17, 41), Today, [AssignmentsDone(), interrupted]);
        Assert.DoesNotContain(GenerationKind.Generate, early.Due);
        Assert.Equal(At(17, 42), early.NextWakeUtc);

        var ready = SchedulerPlanner.Plan(Options, At(17, 42), Today, [AssignmentsDone(), interrupted]);
        Assert.Contains(GenerationKind.Generate, ready.Due);
    }

    [Fact]
    public void Interrupted_retry_delay_is_shorter_than_failure_delay()
    {
        var interrupted = Run(GenerationKind.Generate, GenerationRunStatus.Interrupted, At(17, 30), At(17, 40));
        var failed = Run(GenerationKind.Generate, GenerationRunStatus.Failed, At(17, 30), At(17, 40));

        Assert.Contains(GenerationKind.Generate, SchedulerPlanner.Plan(Options, At(17, 43), Today, [AssignmentsDone(), interrupted]).Due);
        Assert.DoesNotContain(GenerationKind.Generate, SchedulerPlanner.Plan(Options, At(17, 43), Today, [AssignmentsDone(), failed]).Due);
    }

    [Fact]
    public void Interrupted_runs_do_not_consume_failure_attempts()
    {
        var runs = new List<RunInfo> { AssignmentsDone() };
        for (var i = 0; i < Options.MaxTimerAttemptsPerDay; i++)
        {
            runs.Add(Run(GenerationKind.Generate, GenerationRunStatus.Interrupted, At(17, 30 + i * 12), At(17, 35 + i * 12)));
        }

        var plan = SchedulerPlanner.Plan(Options, At(20, 0), Today, runs);

        Assert.Contains(GenerationKind.Generate, plan.Due);
    }

    [Fact]
    public void Interrupted_runs_have_their_own_higher_daily_cap()
    {
        var limit = Options.MaxTimerAttemptsPerDay * SchedulerPlanner.InterruptedAttemptsFactor;
        var runs = new List<RunInfo> { AssignmentsDone() };
        for (var i = 0; i < limit - 1; i++)
        {
            runs.Add(Run(GenerationKind.Generate, GenerationRunStatus.Interrupted, At(17, 30 + i), At(17, 30 + i, 30)));
        }

        Assert.Contains(GenerationKind.Generate, SchedulerPlanner.Plan(Options, At(20, 0), Today, runs).Due);

        runs.Add(Run(GenerationKind.Generate, GenerationRunStatus.Interrupted, At(17, 50), At(17, 51)));

        Assert.DoesNotContain(GenerationKind.Generate, SchedulerPlanner.Plan(Options, At(20, 0), Today, runs).Due);
    }

    [Fact]
    public void Complete_takes_over_when_generate_gave_up_after_only_interruptions()
    {
        var limit = Options.MaxTimerAttemptsPerDay * SchedulerPlanner.InterruptedAttemptsFactor;
        var runs = new List<RunInfo> { AssignmentsDone() };
        for (var i = 0; i < limit; i++)
        {
            runs.Add(Run(GenerationKind.Generate, GenerationRunStatus.Interrupted, At(17, 30 + i), At(17, 30 + i, 30)));
        }

        var early = SchedulerPlanner.Plan(Options, At(18, 0), Today, runs);
        Assert.DoesNotContain(GenerationKind.Generate, early.Due);
        Assert.DoesNotContain(GenerationKind.Complete, early.Due);

        var ready = SchedulerPlanner.Plan(Options, At(18, 15), Today, runs);
        Assert.Contains(GenerationKind.Complete, ready.Due);
    }

    [Fact]
    public void Complete_is_not_started_while_generate_can_still_be_retried()
    {
        var interrupted = Run(GenerationKind.Generate, GenerationRunStatus.Interrupted, At(17, 30), At(17, 40));

        var plan = SchedulerPlanner.Plan(Options, At(18, 20), Today, [AssignmentsDone(), interrupted]);

        Assert.Contains(GenerationKind.Generate, plan.Due);
        Assert.DoesNotContain(GenerationKind.Complete, plan.Due);
    }

    [Fact]
    public void Expired_running_generate_is_treated_as_dead_and_generate_is_due()
    {
        var dead = Run(GenerationKind.Generate, GenerationRunStatus.Running, At(17, 30), null);

        var plan = SchedulerPlanner.Plan(Options, At(17, 35), Today, [AssignmentsDone(), dead]);

        Assert.Equal([GenerationKind.Generate], plan.Due);
    }

    [Fact]
    public void Expired_running_complete_is_dead_and_does_not_block_publish_or_complete()
    {
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Succeeded, At(17, 30), At(17, 50), 3);
        var dead = Run(GenerationKind.Complete, GenerationRunStatus.Running, At(18, 15), null);

        var plan = SchedulerPlanner.Plan(Options, At(19, 0), Today, [AssignmentsDone(), generate, dead]);

        Assert.Equal([GenerationKind.Complete, GenerationKind.Publish], plan.Due);
    }

    [Fact]
    public void Expired_running_publish_is_due_again()
    {
        var dead = Run(GenerationKind.Publish, GenerationRunStatus.Running, At(19, 0), null);
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Succeeded, At(17, 30), At(17, 50), 3);

        var plan = SchedulerPlanner.Plan(Options, At(19, 10), Today, [AssignmentsDone(), generate, dead]);

        Assert.Contains(GenerationKind.Publish, plan.Due);
    }

    [Fact]
    public void Expired_running_close_assignments_is_due_again()
    {
        var dead = Run(GenerationKind.CloseAssignments, GenerationRunStatus.Running, At(0, 5), null);

        var plan = SchedulerPlanner.Plan(Options, At(0, 20), Today, [dead]);

        Assert.Contains(GenerationKind.CloseAssignments, plan.Due);
    }

    [Fact]
    public void Live_running_publish_and_assignments_still_block_themselves()
    {
        var publish = Run(GenerationKind.Publish, GenerationRunStatus.Running, At(19, 0), null);
        var generate = Run(GenerationKind.Generate, GenerationRunStatus.Succeeded, At(17, 30), At(17, 50), 3);
        var assignments = Run(GenerationKind.CloseAssignments, GenerationRunStatus.Running, At(0, 5), null);

        var plan = SchedulerPlanner.Plan(Options, At(19, 1), Today, [assignments with { LeaseUntil = At(19, 3) }, generate, publish]);

        Assert.DoesNotContain(GenerationKind.Publish, plan.Due);
        Assert.DoesNotContain(GenerationKind.CloseAssignments, plan.Due);
    }

    [Fact]
    public void Dead_run_at_exact_lease_boundary_is_still_live()
    {
        var running = Run(GenerationKind.Generate, GenerationRunStatus.Running, At(17, 30), null);

        var atBoundary = SchedulerPlanner.Plan(Options, running.LeaseUntil, Today, [AssignmentsDone(), running]);
        Assert.DoesNotContain(GenerationKind.Generate, atBoundary.Due);

        var after = SchedulerPlanner.Plan(Options, running.LeaseUntil.AddSeconds(1), Today, [AssignmentsDone(), running]);
        Assert.DoesNotContain(GenerationKind.Generate, after.Due);

        var later = SchedulerPlanner.Plan(Options, running.LeaseUntil + SchedulerPlanner.InterruptedRetryDelay, Today, [AssignmentsDone(), running]);
        Assert.Contains(GenerationKind.Generate, later.Due);
    }

    [Fact]
    public void Timer_attempts_are_capped_per_day()
    {
        var runs = new List<RunInfo> { AssignmentsDone() };
        for (var i = 0; i < 3; i++)
        {
            runs.Add(Run(GenerationKind.Generate, GenerationRunStatus.Failed, At(17, 30 + i * 12), At(17, 35 + i * 12)));
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
        var complete = Run(GenerationKind.Complete, GenerationRunStatus.Running, At(18, 55), null) with { LeaseUntil = At(19, 40) };
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
