using System.Text.Json;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Scheduler;

public static class RunKindNames
{
    public static string ToName(GenerationKind kind) => kind switch
    {
        GenerationKind.Generate => "generate",
        GenerationKind.Complete => "complete",
        GenerationKind.Publish => "publish",
        _ => "assignments"
    };

    public static bool TryParse(string? value, out GenerationKind kind)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "generate":
                kind = GenerationKind.Generate;
                return true;
            case "complete":
                kind = GenerationKind.Complete;
                return true;
            case "publish":
                kind = GenerationKind.Publish;
                return true;
            case "assignments":
                kind = GenerationKind.CloseAssignments;
                return true;
            default:
                kind = default;
                return false;
        }
    }

    public static string StatusName(GenerationRunStatus status) => JsonNamingPolicy.CamelCase.ConvertName(status.ToString());

    public static bool TryParseStatus(string? value, out GenerationRunStatus status) =>
        Enum.TryParse(value?.Trim(), true, out status) && Enum.IsDefined(status);

    public static string TriggerName(GenerationTrigger trigger) => trigger == GenerationTrigger.Timer ? "timer" : "manual";
}

public sealed record RunUserView(int Id, string UserName);

public sealed record RunView(
    int Id,
    DateOnly RunDate,
    string Kind,
    string Trigger,
    RunUserView? TriggeredBy,
    string Status,
    DateTime StartedAt,
    DateTime? FinishedAt,
    DateTime LeaseUntil,
    int SucceededCount,
    int FailedCount,
    string? Summary);

public sealed record RunLogView(
    int LessonId,
    string LessonName,
    int? TopicId,
    string? TopicName,
    byte Slot,
    int AttemptNo,
    string Status,
    string? ErrorMessage,
    int? QuestionId,
    DateTime CreatedAt);

public sealed record RunDetailView(RunView Run, IReadOnlyList<RunLogView> Logs);

public sealed record RunPage(int Page, int PageSize, int TotalCount, IReadOnlyList<RunView> Items);

public sealed record RunFilter(GenerationKind? Kind, GenerationRunStatus? Status, DateOnly? From, DateOnly? To, int Page, int PageSize);

public sealed record SchedulerJobStatus(string Kind, DateTime ScheduledAtUtc, bool Due, RunView? LastRun, int? RunningRunId);

public sealed record TopicRefView(int Id, string Name);

public sealed record TodayLessonStatus(int LessonId, string LessonName, TopicRefView? Topic, int Target, int Succeeded, int Failed, int MissingSlots);

public sealed record SchedulerStatusView(
    DateTime NowUtc,
    DateOnly Today,
    bool AiConfigured,
    bool GenerationEnabled,
    bool FakeGenerator,
    IReadOnlyList<SchedulerJobStatus> Jobs,
    IReadOnlyList<TodayLessonStatus> TodayLessons);

public interface ISchedulerQueryService
{
    Task<SchedulerStatusView> GetStatusAsync(CancellationToken cancellationToken);
    Task<RunPage> ListRunsAsync(RunFilter filter, CancellationToken cancellationToken);
    Task<ServiceResult<RunDetailView>> GetRunAsync(int id, CancellationToken cancellationToken);
    Task<RunView?> GetRunViewAsync(int id, CancellationToken cancellationToken);
}

public sealed class SchedulerQueryService(
    AppDbContext db,
    IGenerationRunStore store,
    IDailyGenerationPlanner planner,
    IQuestionGenerator generator,
    TurkeyTime clock,
    IOptions<SchedulerOptions> options,
    IOptions<AiOptions> aiOptions) : ISchedulerQueryService
{
    private const int MaxPageSize = 50;

    public async Task<SchedulerStatusView> GetStatusAsync(CancellationToken cancellationToken)
    {
        var o = options.Value;
        var now = clock.UtcNow;
        var today = TurkeyTime.ToLocalDate(now);
        var runInfos = await store.GetRunsAsync(today, cancellationToken);
        var plan = SchedulerPlanner.Plan(o, now, today, runInfos);
        var dailyPlan = await planner.BuildAsync(today, false, cancellationToken);

        var runIds = runInfos.GroupBy(r => r.Kind).Select(g => g.OrderByDescending(r => r.Id).First().Id).ToList();
        var lastRuns = await RunViewsAsync(db.GenerationRuns.AsNoTracking().Where(r => runIds.Contains(r.Id)), cancellationToken);

        var kinds = new[] { GenerationKind.CloseAssignments, GenerationKind.Generate, GenerationKind.Complete, GenerationKind.Publish };
        var jobs = kinds.Select(kind => new SchedulerJobStatus(
            RunKindNames.ToName(kind),
            SchedulerPlanner.ScheduledAtUtc(o, kind, today),
            plan.Due.Contains(kind),
            lastRuns.FirstOrDefault(r => r.Kind == RunKindNames.ToName(kind)),
            runInfos.Where(r => r.Kind == kind && r.Status == GenerationRunStatus.Running).Select(r => (int?)r.Id).FirstOrDefault()))
            .ToList();

        var lessons = dailyPlan.Lessons
            .Where(l => l.Target > 0 || l.ExistingSlots.Count > 0)
            .Select(l => new TodayLessonStatus(
                l.LessonId,
                l.LessonName,
                l.Topic.TopicId is { } id ? new TopicRefView(id, l.TopicName ?? string.Empty) : null,
                l.Target,
                l.ExistingSlots.Count,
                l.FailedAttempts,
                l.MissingSlots.Count))
            .ToList();

        return new SchedulerStatusView(now, today, generator.IsConfigured, dailyPlan.Enabled, aiOptions.Value.Provider == AiProvider.Fake, jobs, lessons);
    }

    public async Task<RunPage> ListRunsAsync(RunFilter filter, CancellationToken cancellationToken)
    {
        var page = Math.Max(1, filter.Page);
        var pageSize = Math.Clamp(filter.PageSize, 1, MaxPageSize);
        var query = db.GenerationRuns.AsNoTracking().AsQueryable();
        if (filter.Kind is { } kind)
        {
            query = query.Where(r => r.Kind == kind);
        }

        if (filter.Status is { } status)
        {
            query = query.Where(r => r.Status == status);
        }

        if (filter.From is { } from)
        {
            query = query.Where(r => r.RunDate >= from);
        }

        if (filter.To is { } to)
        {
            query = query.Where(r => r.RunDate <= to);
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await RunViewsAsync(query.OrderByDescending(r => r.StartedAt).ThenByDescending(r => r.Id).Skip((page - 1) * pageSize).Take(pageSize), cancellationToken);
        return new RunPage(page, pageSize, total, items);
    }

    public async Task<ServiceResult<RunDetailView>> GetRunAsync(int id, CancellationToken cancellationToken)
    {
        var run = await GetRunViewAsync(id, cancellationToken);
        if (run is null)
        {
            return Fail.NotFound("Çalıştırma bulunamadı.");
        }

        var logs = await db.GenerationLogs.AsNoTracking()
            .Where(l => l.RunId == id)
            .OrderBy(l => l.Id)
            .Join(db.Lessons, l => l.LessonId, lesson => lesson.Id, (l, lesson) => new { Log = l, LessonName = lesson.Name })
            .GroupJoin(db.Topics, x => x.Log.TopicId, t => (int?)t.Id, (x, topics) => new { x.Log, x.LessonName, Topics = topics })
            .SelectMany(x => x.Topics.DefaultIfEmpty(), (x, topic) => new RunLogView(
                x.Log.LessonId,
                x.LessonName,
                x.Log.TopicId,
                topic != null ? topic.Name : null,
                x.Log.Slot,
                x.Log.AttemptNo,
                x.Log.Status.ToString().ToLower(),
                x.Log.ErrorMessage,
                x.Log.QuestionId,
                x.Log.CreatedAt))
            .ToListAsync(cancellationToken);

        return ServiceResult<RunDetailView>.Ok(new RunDetailView(run, logs));
    }

    public async Task<RunView?> GetRunViewAsync(int id, CancellationToken cancellationToken) =>
        (await RunViewsAsync(db.GenerationRuns.AsNoTracking().Where(r => r.Id == id), cancellationToken)).FirstOrDefault();

    private async Task<List<RunView>> RunViewsAsync(IQueryable<GenerationRun> query, CancellationToken cancellationToken)
    {
        var rows = await query
            .GroupJoin(db.Users, r => r.TriggeredByUserId, u => (int?)u.Id, (r, users) => new { Run = r, Users = users })
            .SelectMany(x => x.Users.DefaultIfEmpty(), (x, user) => new { x.Run, UserName = user != null ? user.UserName : null })
            .ToListAsync(cancellationToken);

        return rows
            .OrderByDescending(x => x.Run.StartedAt).ThenByDescending(x => x.Run.Id)
            .Select(x => new RunView(
                x.Run.Id,
                x.Run.RunDate,
                RunKindNames.ToName(x.Run.Kind),
                RunKindNames.TriggerName(x.Run.Trigger),
                x.Run.TriggeredByUserId is { } uid ? new RunUserView(uid, x.UserName ?? string.Empty) : null,
                RunKindNames.StatusName(x.Run.Status),
                x.Run.StartedAt,
                x.Run.FinishedAt,
                x.Run.LeaseUntil,
                x.Run.SucceededCount,
                x.Run.FailedCount,
                x.Run.Summary))
            .ToList();
    }
}
