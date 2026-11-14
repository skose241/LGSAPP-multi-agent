using System.Globalization;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Assignments;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Scheduler;

public sealed record JobContext(RunClaim Claim, DateTime DeadlineUtc);

public sealed record JobOutcome(int Succeeded, int Failed, string Summary)
{
    public GenerationRunStatus Status =>
        Failed == 0 ? GenerationRunStatus.Succeeded
        : Succeeded > 0 ? GenerationRunStatus.PartiallySucceeded
        : GenerationRunStatus.Failed;
}

public interface ISchedulerJob
{
    Task<JobOutcome> RunAsync(JobContext context, CancellationToken cancellationToken);
}

public sealed class GenerationJob(
    IDailyGenerationPlanner planner,
    IQuestionGenerator generator,
    IQuestionVerifier verifier,
    IAiQuestionWriter writer,
    IRunNotifier notifier,
    AppDbContext db,
    TurkeyTime clock,
    TimeProvider timeProvider,
    IOptions<SchedulerOptions> options,
    ILogger<GenerationJob> logger) : ISchedulerJob
{
    public async Task<JobOutcome> RunAsync(JobContext context, CancellationToken cancellationToken)
    {
        var o = options.Value;
        var today = context.Claim.RunDate;
        var plan = await planner.BuildAsync(today, true, cancellationToken);

        if (!plan.Enabled)
        {
            return new JobOutcome(0, 0, SchedulerMessages.GenerationDisabled);
        }

        if (plan.AiUserId is null)
        {
            return new JobOutcome(0, 1, "Yapay zekâ sistem hesabı bulunamadı.");
        }

        var attempts = await db.GenerationLogs.AsNoTracking()
            .Where(l => l.RunDate == today)
            .GroupBy(l => new { l.LessonId, l.Slot })
            .Select(g => new { g.Key.LessonId, g.Key.Slot, Count = g.Count() })
            .ToDictionaryAsync(x => (x.LessonId, x.Slot), x => x.Count, cancellationToken);

        var succeeded = 0;
        var failed = 0;
        var parts = new List<string>();
        var skippedForTime = 0;
        var firstCall = true;
        var breaker = new GenerationCircuitBreaker();

        foreach (var lesson in plan.Lessons.Where(l => l.MissingSlots.Count > 0))
        {
            var lessonOk = 0;
            var lessonFailed = 0;

            foreach (var slot in lesson.MissingSlots)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (clock.UtcNow >= context.DeadlineUtc)
                {
                    skippedForTime++;
                    continue;
                }

                var attemptNo = attempts.GetValueOrDefault((lesson.LessonId, slot)) + 1;
                attempts[(lesson.LessonId, slot)] = attemptNo;
                var slotContext = new SlotContext(context.Claim.RunId, today, plan.AiUserId.Value, lesson.LessonId, lesson.Topic.TopicId, lesson.Topic.Source, slot, attemptNo);

                if (lesson.Topic.TopicId is not { } topicId)
                {
                    await writer.WriteFailureAsync(slotContext, SchedulerMessages.NoTopic, null, null, cancellationToken);
                    lessonFailed++;
                    continue;
                }

                if (!generator.IsConfigured)
                {
                    await writer.WriteFailureAsync(slotContext, SchedulerMessages.AiNotConfigured, null, null, cancellationToken);
                    lessonFailed++;
                    continue;
                }

                if (breaker.Tripped)
                {
                    await writer.WriteFailureAsync(slotContext, breaker.Message!, null, null, cancellationToken);
                    lessonFailed++;
                    continue;
                }

                if (!firstCall && o.DelayBetweenAiCallsSeconds > 0)
                {
                    await Task.Delay(TimeSpan.FromSeconds(o.DelayBetweenAiCallsSeconds), timeProvider, cancellationToken);
                }

                firstCall = false;

                var outcome = await GenerateSlotAsync(slotContext, lesson, topicId, attemptNo, context.DeadlineUtc, breaker, cancellationToken);
                if (outcome == true)
                {
                    lessonOk++;
                }
                else if (outcome == false)
                {
                    lessonFailed++;
                }
            }

            succeeded += lessonOk;
            failed += lessonFailed;
            if (lessonOk + lessonFailed > 0)
            {
                var target = lesson.MissingSlots.Count;
                parts.Add(lessonFailed > 0
                    ? $"{lesson.LessonName}: {lessonOk}/{target} ({lessonFailed} hata)"
                    : $"{lesson.LessonName}: {lessonOk}/{target}");
            }
        }

        var summary = parts.Count == 0 ? "Eksik soru yok." : string.Join(", ", parts);
        if (skippedForTime > 0)
        {
            summary += $" Süre sınırı aşıldı, {skippedForTime.ToString(CultureInfo.InvariantCulture)} slot atlandı.";
        }

        if (breaker.Tripped)
        {
            summary += $" {breaker.Message}";
        }

        if (succeeded + failed > 0)
        {
            try
            {
                var report = $"Günlük soru üretimi: {succeeded.ToString(CultureInfo.InvariantCulture)} başarılı, {failed.ToString(CultureInfo.InvariantCulture)} hatalı.";
                if (breaker.Tripped)
                {
                    report += $" {breaker.Message}";
                }

                await notifier.NotifyRoleAsync(
                    Roles.MudurId,
                    NotificationType.GenerationReport,
                    report,
                    context.Claim.RunId,
                    cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Üretim raporu bildirimi gönderilemedi.");
            }
        }

        return new JobOutcome(succeeded, failed, summary);
    }

    private async Task<bool?> GenerateSlotAsync(
        SlotContext slot,
        LessonGenerationPlan lesson,
        int topicId,
        int attemptNo,
        DateTime deadlineUtc,
        GenerationCircuitBreaker breaker,
        CancellationToken cancellationToken)
    {
        try
        {
            if (await db.Questions.AsNoTracking().AnyAsync(
                    q => q.Source == QuestionSource.Ai && q.LessonId == slot.LessonId && q.GenerationDate == slot.RunDate && q.GenerationSlot == slot.Slot,
                    cancellationToken))
            {
                await writer.WriteSkippedAsync(slot, "Slot zaten dolu.", cancellationToken);
                return null;
            }

            var recentFull = await db.Questions.AsNoTracking()
                .Where(q => q.TopicId == topicId && q.Source == QuestionSource.Ai && q.Text != null)
                .OrderByDescending(q => q.CreatedAt).ThenByDescending(q => q.Id)
                .Select(q => q.Text!)
                .Take(AiRules.RecentQuestionCount)
                .ToListAsync(cancellationToken);
            var recent = recentFull.Select(t => t.Length > AiRules.RecentQuestionMaxChars ? t[..AiRules.RecentQuestionMaxChars] : t).ToList();

            var recentOptions = await db.Questions.AsNoTracking()
                .Where(q => q.LessonId == slot.LessonId && q.Source == QuestionSource.Ai)
                .OrderByDescending(q => q.CreatedAt).ThenByDescending(q => q.Id)
                .Select(q => (int)q.CorrectOption)
                .Take(AiRules.DistributionWindow)
                .ToListAsync(cancellationToken);
            var target = AnswerBalancer.PickTarget(recentOptions, (slot.Slot + slot.LessonId) % 4 + 1);

            var request = new QuestionGenerationRequest(
                lesson.LessonId, lesson.LessonName, topicId, lesson.TopicName ?? string.Empty, slot.Slot, attemptNo, recent, target, deadlineUtc);
            var result = await generator.GenerateAsync(request, cancellationToken);
            if (!result.Succeeded)
            {
                breaker.Observe(result.ErrorKind);
                await writer.WriteFailureAsync(slot, result.Error ?? "Soru üretilemedi.", result, null, cancellationToken);
                return false;
            }

            var check = AiQuestionValidator.Check(result, recentFull, lesson.TopicName);
            if (check.Value is not { } question)
            {
                await writer.WriteFailureAsync(slot, check.Error ?? "Soru doğrulanamadı.", result, null, cancellationToken);
                return false;
            }

            foreach (var warning in check.Warnings)
            {
                logger.LogWarning("Üretilen soru uyarısı. Ders {LessonId}, slot {Slot}: {Warning}", slot.LessonId, slot.Slot, warning);
            }

            QuestionVerification? verification = null;
            if (await verifier.IsEnabledAsync(cancellationToken))
            {
                verification = await verifier.VerifyAsync(request, question, cancellationToken);
                if (!verification.Passed)
                {
                    breaker.Observe(verification.ErrorKind);
                    await writer.WriteFailureAsync(slot, verification.Error ?? "Soru doğrulanamadı.", result, verification, cancellationToken);
                    return false;
                }
            }

            var written = await writer.WriteSuccessAsync(slot, result, question, verification, cancellationToken);
            if (written.Status == SlotWriteStatus.Skipped)
            {
                await writer.WriteSkippedAsync(slot, "Slot başka bir çalıştırma tarafından dolduruldu.", cancellationToken);
                return null;
            }

            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Soru üretimi beklenmeyen şekilde başarısız oldu. Ders {LessonId}, slot {Slot}", slot.LessonId, slot.Slot);
            try
            {
                await writer.WriteFailureAsync(slot, $"Beklenmeyen hata: {ex.Message}", null, null, cancellationToken);
            }
            catch (Exception inner) when (inner is not OperationCanceledException)
            {
                logger.LogError(inner, "Başarısız slot kaydı yazılamadı.");
            }

            return false;
        }
    }
}

public sealed class PublishJob(
    AppDbContext db,
    IRunNotifier notifier,
    TurkeyTime clock,
    ILogger<PublishJob> logger) : ISchedulerJob
{
    public async Task<JobOutcome> RunAsync(JobContext context, CancellationToken cancellationToken)
    {
        var today = context.Claim.RunDate;
        var published = await db.ExecuteInTransactionAsync(async token =>
        {
            var ai = (byte)QuestionSource.Ai;
            var teacher = (byte)QuestionSource.Teacher;
            var candidates = await db.Questions
                .FromSqlInterpolated($@"SELECT q.* FROM [Questions] AS q WITH (UPDLOCK, ROWLOCK)
                    WHERE q.[PublishedAt] IS NULL AND q.[IsHidden] = 0
                    AND ((q.[Source] = {ai} AND q.[GenerationDate] <= {today}) OR (q.[Source] = {teacher} AND q.[ScheduledPublishDate] <= {today}))
                    AND NOT EXISTS (SELECT 1 FROM [AssignmentQuestions] AS aq WITH (READCOMMITTEDLOCK) WHERE aq.[QuestionId] = q.[Id])")
                .ToListAsync(token);

            if (candidates.Count == 0)
            {
                return new Dictionary<int, int>();
            }

            var now = clock.UtcNow;
            foreach (var question in candidates)
            {
                question.PublishedAt = now;
            }

            await db.SaveChangesAsync(token);
            return candidates.GroupBy(q => q.LessonId).ToDictionary(g => g.Key, g => g.Count());
        }, cancellationToken);

        var total = published.Values.Sum();
        if (total == 0)
        {
            return new JobOutcome(0, 0, "Yayınlanacak soru yok.");
        }

        var names = await db.Lessons.AsNoTracking()
            .Where(l => published.Keys.Contains(l.Id))
            .OrderBy(l => l.OrderNo).ThenBy(l => l.Id)
            .Select(l => new { l.Id, l.Name })
            .ToListAsync(cancellationToken);
        var summary = string.Join(", ", names.Select(n => $"{n.Name}: {published[n.Id].ToString(CultureInfo.InvariantCulture)}"));

        try
        {
            await notifier.NotifyRoleAsync(
                Roles.OgrenciId,
                NotificationType.QuestionsPublished,
                $"Bugünün {total.ToString(CultureInfo.InvariantCulture)} sorusu yayında.",
                context.Claim.RunId,
                cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Yayın bildirimi gönderilemedi.");
        }

        return new JobOutcome(total, 0, $"{total.ToString(CultureInfo.InvariantCulture)} soru yayınlandı. {summary}");
    }
}

public sealed class AssignmentLifecycleJob(IAssignmentLifecycleService lifecycle) : ISchedulerJob
{
    public async Task<JobOutcome> RunAsync(JobContext context, CancellationToken cancellationToken)
    {
        var closed = await lifecycle.CloseDueAsync(context.Claim.RunDate, cancellationToken);
        var opened = await lifecycle.ActivateDueAsync(context.Claim.RunDate, cancellationToken);
        return new JobOutcome(
            closed + opened,
            0,
            $"Kapanan ödev: {closed.ToString(CultureInfo.InvariantCulture)}, açılan ödev: {opened.ToString(CultureInfo.InvariantCulture)}.");
    }
}
