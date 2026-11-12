using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Scheduler;

public sealed record LessonGenerationPlan(
    int LessonId,
    string LessonName,
    int Target,
    IReadOnlyList<byte> ExistingSlots,
    IReadOnlyList<byte> MissingSlots,
    TopicChoice Topic,
    string? TopicName,
    int FailedAttempts);

public sealed record DailyGenerationPlan(int? AiUserId, bool Enabled, IReadOnlyList<LessonGenerationPlan> Lessons);

public interface IDailyGenerationPlanner
{
    Task<DailyGenerationPlan> BuildAsync(DateOnly today, bool refreshSettings, CancellationToken cancellationToken);
}

public sealed class DailyGenerationPlanner(AppDbContext db, ISettingsService settings, IOptions<SchedulerOptions> options) : IDailyGenerationPlanner
{
    public async Task<DailyGenerationPlan> BuildAsync(DateOnly today, bool refreshSettings, CancellationToken cancellationToken)
    {
        if (refreshSettings)
        {
            settings.Invalidate();
        }

        var enabled = await settings.GetIntAsync(SettingKeys.SoruUretimAktifMi, cancellationToken) == 1;
        var multiplier = await settings.GetIntAsync(SettingKeys.SoruCarpani, cancellationToken);
        var isoDay = (byte)TurkeyTime.IsoDayOfWeek(today);

        var aiUserId = await db.UserRoles.AsNoTracking()
            .Where(ur => ur.RoleId == Roles.AiId)
            .Select(ur => (int?)ur.UserId)
            .FirstOrDefaultAsync(cancellationToken);

        var lessons = await db.Lessons.AsNoTracking()
            .Where(l => l.IsActive)
            .OrderBy(l => l.OrderNo).ThenBy(l => l.Id)
            .Select(l => new { l.Id, l.Name })
            .ToListAsync(cancellationToken);

        var schedule = await db.GenerationSchedules.AsNoTracking()
            .Where(s => s.DayOfWeek == isoDay)
            .ToDictionaryAsync(s => s.LessonId, s => (int)s.QuestionCount, cancellationToken);

        var plans = await db.DailyTopicPlans.AsNoTracking()
            .Where(p => p.PlanDate == today)
            .ToDictionaryAsync(p => p.LessonId, cancellationToken);

        var existing = await db.Questions.AsNoTracking()
            .Where(q => q.Source == QuestionSource.Ai && q.GenerationDate == today)
            .Select(q => new { q.LessonId, Slot = q.GenerationSlot!.Value, q.TopicId })
            .ToListAsync(cancellationToken);

        var lastUsed = await db.DailyTopicPlans.AsNoTracking()
            .Where(p => p.UsedAt != null)
            .GroupBy(p => p.LessonId)
            .Select(g => new { LessonId = g.Key, TopicId = g.OrderByDescending(x => x.PlanDate).Select(x => x.TopicId).First() })
            .ToDictionaryAsync(x => x.LessonId, x => x.TopicId, cancellationToken);

        var topics = await db.Topics.AsNoTracking()
            .Where(t => t.IsActive && t.Lesson.IsActive)
            .OrderBy(t => t.OrderNo).ThenBy(t => t.Id)
            .Select(t => new { t.Id, t.LessonId, t.Name })
            .ToListAsync(cancellationToken);

        var failed = await db.GenerationLogs.AsNoTracking()
            .Where(l => l.RunDate == today && l.Status == GenerationLogStatus.Failed)
            .GroupBy(l => l.LessonId)
            .Select(g => new { LessonId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.LessonId, x => x.Count, cancellationToken);

        var topicNames = topics.ToDictionary(t => t.Id, t => t.Name);
        var activeTopicIds = topicNames.Keys.ToHashSet();
        var firstTopic = topics.GroupBy(t => t.LessonId).ToDictionary(g => g.Key, g => g.First().Id);
        var inactiveNames = await TopicNamesAsync(existing.Select(e => e.TopicId).Where(id => id is not null).Select(id => id!.Value).Where(id => !topicNames.ContainsKey(id)).Distinct().ToList(), cancellationToken);

        var result = new List<LessonGenerationPlan>();
        foreach (var lesson in lessons)
        {
            plans.TryGetValue(lesson.Id, out var plan);
            var scheduleCount = schedule.GetValueOrDefault(lesson.Id);
            var target = SlotPlanner.Target(plan?.TargetCount, scheduleCount, multiplier, options.Value.MaxSlotsPerLesson);
            var done = existing.Where(e => e.LessonId == lesson.Id).ToList();
            var missing = SlotPlanner.MissingSlots(target, done.Select(d => d.Slot));

            int? todayTopic = done.Select(d => d.TopicId).FirstOrDefault(id => id is not null);
            int? planTopic = plan is not null && activeTopicIds.Contains(plan.TopicId) ? plan.TopicId : null;
            int? last = lastUsed.TryGetValue(lesson.Id, out var lastTopic) && activeTopicIds.Contains(lastTopic) ? lastTopic : null;
            int? first = firstTopic.TryGetValue(lesson.Id, out var firstId) ? firstId : null;

            var choice = TopicResolver.Resolve(todayTopic, planTopic, last, first);
            string? topicName = null;
            if (choice.TopicId is { } id)
            {
                topicName = topicNames.GetValueOrDefault(id) ?? inactiveNames.GetValueOrDefault(id);
            }

            result.Add(new LessonGenerationPlan(
                lesson.Id,
                lesson.Name,
                target,
                done.Select(d => d.Slot).ToList(),
                missing,
                choice,
                topicName,
                failed.GetValueOrDefault(lesson.Id)));
        }

        return new DailyGenerationPlan(aiUserId, enabled, result);
    }

    private async Task<Dictionary<int, string>> TopicNamesAsync(IReadOnlyCollection<int> ids, CancellationToken cancellationToken)
    {
        if (ids.Count == 0)
        {
            return [];
        }

        return await db.Topics.AsNoTracking()
            .Where(t => ids.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.Name, cancellationToken);
    }
}
