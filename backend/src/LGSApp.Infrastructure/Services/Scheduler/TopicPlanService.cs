using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Assignments;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Scheduler;

public sealed record TopicPlanLessonView(
    int LessonId,
    string LessonName,
    int TargetCount,
    TopicRefView? Topic,
    RunUserView? PlannedBy,
    DateTime? UsedAt,
    bool CanEdit,
    byte[]? RowVersion);

public sealed record TopicPlanDayView(DateOnly Date, int IsoDayOfWeek, IReadOnlyList<TopicPlanLessonView> Lessons);

public sealed record TopicPlanRangeView(IReadOnlyList<TopicPlanDayView> Days);

public sealed record SaveTopicPlanCommand(int TopicId, int? TargetCount, byte[]? RowVersion);

public interface ITopicPlanService
{
    Task<ServiceResult<TopicPlanRangeView>> GetAsync(Actor actor, DateOnly? from, DateOnly? to, CancellationToken cancellationToken);
    Task<ServiceResult<TopicPlanLessonView>> SaveAsync(Actor actor, DateOnly date, int lessonId, SaveTopicPlanCommand command, CancellationToken cancellationToken);
    Task<ServiceResult> DeleteAsync(Actor actor, DateOnly date, int lessonId, byte[]? rowVersion, CancellationToken cancellationToken);
}

public sealed class TopicPlanService(
    AppDbContext db,
    ISettingsService settings,
    TurkeyTime clock,
    IOptions<SchedulerOptions> options) : ITopicPlanService
{
    public const int MaxRangeDays = 31;
    public const int MaxFutureDays = 30;
    public const string LockedMessage = "Bu günün konusu artık değiştirilemez.";

    public async Task<ServiceResult<TopicPlanRangeView>> GetAsync(Actor actor, DateOnly? from, DateOnly? to, CancellationToken cancellationToken)
    {
        var today = clock.Today;
        var start = from ?? today;
        var end = to ?? start.AddDays(6);
        if (end < start || end.DayNumber - start.DayNumber + 1 > MaxRangeDays)
        {
            return Fail.Validation($"Tarih aralığı en fazla {MaxRangeDays} gün olabilir.");
        }

        var scope = await ResolveLessonScopeAsync(actor, cancellationToken);
        if (scope.Failure is { } failure)
        {
            return failure;
        }

        var lessonIds = scope.LessonIds!;
        var lessons = await db.Lessons.AsNoTracking()
            .Where(l => l.IsActive && lessonIds.Contains(l.Id))
            .OrderBy(l => l.OrderNo).ThenBy(l => l.Id)
            .Select(l => new { l.Id, l.Name })
            .ToListAsync(cancellationToken);

        var multiplier = await settings.GetIntAsync(SettingKeys.SoruCarpani, cancellationToken);
        var schedule = await db.GenerationSchedules.AsNoTracking()
            .Where(s => lessonIds.Contains(s.LessonId))
            .ToDictionaryAsync(s => (s.DayOfWeek, s.LessonId), s => (int)s.QuestionCount, cancellationToken);

        var plans = await db.DailyTopicPlans.AsNoTracking()
            .Where(p => p.PlanDate >= start && p.PlanDate <= end && lessonIds.Contains(p.LessonId))
            .ToListAsync(cancellationToken);

        var topicIds = plans.Select(p => p.TopicId).Distinct().ToList();
        var topicNames = await db.Topics.AsNoTracking().Where(t => topicIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.Name, cancellationToken);
        var userIds = plans.Select(p => p.PlannedByUserId).Distinct().ToList();
        var userNames = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.UserName ?? string.Empty, cancellationToken);
        var planMap = plans.ToDictionary(p => (p.PlanDate, p.LessonId));

        var o = options.Value;
        var afterDeadline = clock.LocalNow.TimeOfDay >= o.TopicDeadlineTime.ToTimeSpan();
        var days = new List<TopicPlanDayView>();
        for (var date = start; date <= end; date = date.AddDays(1))
        {
            var iso = TurkeyTime.IsoDayOfWeek(date);
            var items = new List<TopicPlanLessonView>();
            foreach (var lesson in lessons)
            {
                planMap.TryGetValue((date, lesson.Id), out var plan);
                var scheduleCount = schedule.GetValueOrDefault(((byte)iso, lesson.Id));
                var target = SlotPlanner.Target(plan?.TargetCount, scheduleCount, multiplier, o.MaxSlotsPerLesson);
                var canEdit = scheduleCount > 0 && IsEditableDate(date, today, afterDeadline) && plan?.UsedAt is null;
                items.Add(new TopicPlanLessonView(
                    lesson.Id,
                    lesson.Name,
                    target,
                    plan is null ? null : new TopicRefView(plan.TopicId, topicNames.GetValueOrDefault(plan.TopicId) ?? string.Empty),
                    plan is null ? null : new RunUserView(plan.PlannedByUserId, userNames.GetValueOrDefault(plan.PlannedByUserId) ?? string.Empty),
                    plan?.UsedAt,
                    canEdit,
                    plan?.RowVersion));
            }

            days.Add(new TopicPlanDayView(date, iso, items));
        }

        return ServiceResult<TopicPlanRangeView>.Ok(new TopicPlanRangeView(days));
    }

    public async Task<ServiceResult<TopicPlanLessonView>> SaveAsync(Actor actor, DateOnly date, int lessonId, SaveTopicPlanCommand command, CancellationToken cancellationToken)
    {
        var today = clock.Today;
        if (date < today || date > today.AddDays(MaxFutureDays))
        {
            return Fail.Validation($"Tarih bugünden itibaren en fazla {MaxFutureDays.ToString(System.Globalization.CultureInfo.InvariantCulture)} gün içinde olmalıdır.");
        }

        var access = await CheckLessonAccessAsync(actor, lessonId, cancellationToken);
        if (access is { } denied)
        {
            return denied;
        }

        if (!actor.IsMudur && command.TargetCount is not null)
        {
            return Fail.Forbidden("Hedef soru sayısını yalnızca müdür belirleyebilir.");
        }

        if (command.TargetCount is < 0 or > SlotPlanner.AbsoluteMaxSlots)
        {
            return Fail.Validation($"Hedef soru sayısı 0 ile {SlotPlanner.AbsoluteMaxSlots} arasında olmalıdır.");
        }

        var topicOk = await db.Topics.AsNoTracking().AnyAsync(t => t.Id == command.TopicId && t.LessonId == lessonId && t.IsActive, cancellationToken);
        if (!topicOk)
        {
            return Fail.Validation("Seçilen konu bu derse ait aktif bir konu değil.");
        }

        var iso = (byte)TurkeyTime.IsoDayOfWeek(date);
        var scheduleCount = await db.GenerationSchedules.AsNoTracking()
            .Where(s => s.DayOfWeek == iso && s.LessonId == lessonId)
            .Select(s => (int?)s.QuestionCount)
            .FirstOrDefaultAsync(cancellationToken);
        if (scheduleCount is null or 0)
        {
            return Fail.Validation("Bu gün bu derste soru üretimi planlanmamış.");
        }

        var o = options.Value;
        var result = await db.ExecuteInTransactionAsync<ServiceResult>(async token =>
        {
            var existing = await LockPlanAsync(date, lessonId, token);
            var afterDeadline = clock.LocalNow.TimeOfDay >= o.TopicDeadlineTime.ToTimeSpan();
            if (existing?.UsedAt is not null || !IsEditableDate(date, clock.Today, afterDeadline))
            {
                return Fail.Conflict(LockedMessage);
            }

            if (existing is null)
            {
                db.DailyTopicPlans.Add(new DailyTopicPlan
                {
                    PlanDate = date,
                    LessonId = lessonId,
                    TopicId = command.TopicId,
                    PlannedByUserId = actor.UserId,
                    TargetCount = actor.IsMudur ? (byte?)command.TargetCount : null,
                    CreatedAt = clock.UtcNow
                });
            }
            else
            {
                if (command.RowVersion is { Length: > 0 } && !command.RowVersion.AsSpan().SequenceEqual(existing.RowVersion))
                {
                    return Fail.Conflict("Plan başka biri tarafından değiştirilmiş. Sayfayı yenileyin.");
                }

                existing.TopicId = command.TopicId;
                existing.PlannedByUserId = actor.UserId;
                if (actor.IsMudur)
                {
                    existing.TargetCount = (byte?)command.TargetCount;
                }
            }

            try
            {
                await db.SaveChangesAsync(token);
            }
            catch (DbUpdateException ex) when (ex.IsUniqueViolation())
            {
                return Fail.Conflict("Bu gün ve ders için başka bir plan aynı anda kaydedildi.");
            }
            catch (DbUpdateConcurrencyException)
            {
                return Fail.Conflict("Plan başka biri tarafından değiştirilmiş. Sayfayı yenileyin.");
            }

            return ServiceResult.Ok();
        }, cancellationToken);

        if (!result.Succeeded)
        {
            return ServiceResult<TopicPlanLessonView>.From(result);
        }

        var view = await GetAsync(actor, date, date, cancellationToken);
        return view.Succeeded
            ? ServiceResult<TopicPlanLessonView>.Ok(view.Value!.Days[0].Lessons.First(l => l.LessonId == lessonId))
            : ServiceResult<TopicPlanLessonView>.From(view);
    }

    public async Task<ServiceResult> DeleteAsync(Actor actor, DateOnly date, int lessonId, byte[]? rowVersion, CancellationToken cancellationToken)
    {
        var today = clock.Today;
        if (date < today || date > today.AddDays(MaxFutureDays))
        {
            return Fail.Validation($"Tarih bugünden itibaren en fazla {MaxFutureDays.ToString(System.Globalization.CultureInfo.InvariantCulture)} gün içinde olmalıdır.");
        }

        var access = await CheckLessonAccessAsync(actor, lessonId, cancellationToken);
        if (access is { } denied)
        {
            return denied;
        }

        var o = options.Value;
        return await db.ExecuteInTransactionAsync<ServiceResult>(async token =>
        {
            var existing = await LockPlanAsync(date, lessonId, token);
            if (existing is null)
            {
                return Fail.NotFound("Konu planı bulunamadı.");
            }

            var afterDeadline = clock.LocalNow.TimeOfDay >= o.TopicDeadlineTime.ToTimeSpan();
            if (existing.UsedAt is not null || !IsEditableDate(date, clock.Today, afterDeadline))
            {
                return Fail.Conflict(LockedMessage);
            }

            if (rowVersion is { Length: > 0 } && !rowVersion.AsSpan().SequenceEqual(existing.RowVersion))
            {
                return Fail.Conflict("Plan başka biri tarafından değiştirilmiş. Sayfayı yenileyin.");
            }

            db.DailyTopicPlans.Remove(existing);
            try
            {
                await db.SaveChangesAsync(token);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Fail.Conflict("Plan başka biri tarafından değiştirilmiş. Sayfayı yenileyin.");
            }

            return ServiceResult.Ok();
        }, cancellationToken);
    }

    private static bool IsEditableDate(DateOnly date, DateOnly today, bool afterDeadline) =>
        date >= today && date <= today.AddDays(MaxFutureDays) && !(date == today && afterDeadline);

    private async Task<DailyTopicPlan?> LockPlanAsync(DateOnly date, int lessonId, CancellationToken cancellationToken)
    {
        var rows = await db.DailyTopicPlans
            .FromSqlInterpolated($"SELECT * FROM [DailyTopicPlans] WITH (UPDLOCK, ROWLOCK) WHERE [PlanDate] = {date} AND [LessonId] = {lessonId}")
            .ToListAsync(cancellationToken);
        return rows.FirstOrDefault();
    }

    private sealed record LessonScope(IReadOnlyList<int>? LessonIds, Failure? Failure);

    private async Task<LessonScope> ResolveLessonScopeAsync(Actor actor, CancellationToken cancellationToken)
    {
        if (actor.IsMudur)
        {
            var all = await db.Lessons.AsNoTracking().Where(l => l.IsActive).Select(l => l.Id).ToListAsync(cancellationToken);
            return new LessonScope(all, null);
        }

        var branch = await db.Users.AsNoTracking().Where(u => u.Id == actor.UserId).Select(u => u.BranchLessonId).FirstOrDefaultAsync(cancellationToken);
        return branch is { } id
            ? new LessonScope([id], null)
            : new LessonScope(null, Fail.Forbidden("Hesabınıza branş dersi tanımlanmamış."));
    }

    private async Task<Failure?> CheckLessonAccessAsync(Actor actor, int lessonId, CancellationToken cancellationToken)
    {
        if (!actor.IsMudur)
        {
            var branch = await db.Users.AsNoTracking().Where(u => u.Id == actor.UserId).Select(u => u.BranchLessonId).FirstOrDefaultAsync(cancellationToken);
            if (branch is null)
            {
                return Fail.Forbidden("Hesabınıza branş dersi tanımlanmamış.");
            }

            if (branch != lessonId)
            {
                return Fail.Forbidden("Yalnızca branş dersiniz için konu planlayabilirsiniz.");
            }
        }

        var exists = await db.Lessons.AsNoTracking().AnyAsync(l => l.Id == lessonId && l.IsActive, cancellationToken);
        return exists ? null : Fail.NotFound("Ders bulunamadı.");
    }
}

public sealed record ScheduleItemView(int IsoDayOfWeek, int LessonId, int QuestionCount);

public sealed record ScheduleLessonView(int Id, string Name);

public sealed record GenerationScheduleView(IReadOnlyList<ScheduleLessonView> Lessons, IReadOnlyList<ScheduleItemView> Items);

public interface IGenerationScheduleService
{
    Task<GenerationScheduleView> GetAsync(CancellationToken cancellationToken);
    Task<ServiceResult<GenerationScheduleView>> ReplaceAsync(IReadOnlyList<ScheduleItemView> items, CancellationToken cancellationToken);
}

public sealed class GenerationScheduleService(AppDbContext db) : IGenerationScheduleService
{
    public async Task<GenerationScheduleView> GetAsync(CancellationToken cancellationToken)
    {
        var lessons = await db.Lessons.AsNoTracking()
            .Where(l => l.IsActive)
            .OrderBy(l => l.OrderNo).ThenBy(l => l.Id)
            .Select(l => new ScheduleLessonView(l.Id, l.Name))
            .ToListAsync(cancellationToken);
        var items = await db.GenerationSchedules.AsNoTracking()
            .OrderBy(s => s.DayOfWeek).ThenBy(s => s.LessonId)
            .Select(s => new ScheduleItemView(s.DayOfWeek, s.LessonId, s.QuestionCount))
            .ToListAsync(cancellationToken);
        return new GenerationScheduleView(lessons, items);
    }

    public async Task<ServiceResult<GenerationScheduleView>> ReplaceAsync(IReadOnlyList<ScheduleItemView> items, CancellationToken cancellationToken)
    {
        var errors = new ValidationErrors();
        var seen = new HashSet<(int, int)>();
        var lessonIds = await db.Lessons.AsNoTracking().Select(l => l.Id).ToListAsync(cancellationToken);
        var known = lessonIds.ToHashSet();
        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
            var key = $"items[{i}]";
            if (item.IsoDayOfWeek is < 1 or > 7)
            {
                errors.Add(key, "Gün 1 (Pazartesi) ile 7 (Pazar) arasında olmalıdır.");
            }

            if (item.QuestionCount is < 0 or > SlotPlanner.AbsoluteMaxSlots)
            {
                errors.Add(key, $"Soru adedi 0 ile {SlotPlanner.AbsoluteMaxSlots} arasında olmalıdır.");
            }

            if (!known.Contains(item.LessonId))
            {
                errors.Add(key, "Ders bulunamadı.");
            }

            if (!seen.Add((item.IsoDayOfWeek, item.LessonId)))
            {
                errors.Add(key, "Aynı gün ve ders birden fazla kez verilmiş.");
            }
        }

        if (errors.Any)
        {
            return errors.ToFailure("Ders programı geçersiz.");
        }

        await db.ExecuteInTransactionAsync<int>(async token =>
        {
            await db.GenerationSchedules.ExecuteDeleteAsync(token);
            db.GenerationSchedules.AddRange(items.Select(i => new GenerationSchedule
            {
                DayOfWeek = (byte)i.IsoDayOfWeek,
                LessonId = i.LessonId,
                QuestionCount = (byte)i.QuestionCount
            }));
            await db.SaveChangesAsync(token);
            return items.Count;
        }, cancellationToken);

        return ServiceResult<GenerationScheduleView>.Ok(await GetAsync(cancellationToken));
    }
}
