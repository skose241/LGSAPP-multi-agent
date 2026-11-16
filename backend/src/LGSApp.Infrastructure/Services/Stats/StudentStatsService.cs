using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Assignments;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Leaderboard;
using LGSApp.Infrastructure.Services.Questions;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Stats;

public sealed record AnswerTotalsView(int Answered, int Correct, int Wrong, double? SuccessRate);

public sealed record LessonStatsView(LessonRefView Lesson, int Answered, int Correct, int Wrong, double? SuccessRate);

public sealed record AssignmentParticipationView(int Assigned, int Completed, int Partial, int Missed, int NotStarted);

public sealed record PeriodStandingView(int Points, int? Rank);

public sealed record PointsStatsView(int Total, PeriodStandingView Weekly, PeriodStandingView Monthly);

public sealed record ContributionStatsView(int QuestionsUploaded, int SolutionsWritten);

public sealed record UploadTodayView(
    DateOnly Date,
    int Uploaded,
    int DailyLimit,
    int Remaining,
    int PointsPerQuestion,
    int ScoredLimit,
    int ScoredToday,
    int ScoredRemaining);

public sealed record StudentStatsView(
    AnswerTotalsView Totals,
    IReadOnlyList<LessonStatsView> Lessons,
    AssignmentParticipationView Assignments,
    PointsStatsView Points,
    ContributionStatsView Contributions,
    UploadTodayView UploadToday);

public interface IStudentStatsService
{
    Task<ServiceResult<StudentStatsView>> GetAsync(int studentUserId, CancellationToken cancellationToken = default);
}

public sealed class StudentStatsService(AppDbContext db, ILeaderboardService leaderboard, ISettingsService settings, TurkeyTime clock) : IStudentStatsService
{
    public async Task<ServiceResult<StudentStatsView>> GetAsync(int studentUserId, CancellationToken cancellationToken = default)
    {
        var student = await db.Users.AsNoTracking()
            .Where(u => u.Id == studentUserId && db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == Roles.OgrenciId))
            .Select(u => new { u.Id, u.Points, u.CreatedAt })
            .FirstOrDefaultAsync(cancellationToken);
        if (student is null)
        {
            return Fail.NotFound("Öğrenci bulunamadı.");
        }

        var byLesson = await (
            from a in db.Answers.AsNoTracking()
            where a.UserId == studentUserId
            join q in db.Questions on a.QuestionId equals q.Id
            group a by q.LessonId into g
            select new { LessonId = g.Key, Answered = g.Count(), Correct = g.Count(x => x.IsCorrect) })
            .ToListAsync(cancellationToken);
        var stats = byLesson.ToDictionary(x => x.LessonId);

        var lessons = await db.Lessons.AsNoTracking()
            .OrderBy(l => l.OrderNo).ThenBy(l => l.Id)
            .Select(l => new { l.Id, l.Name, l.IsActive })
            .ToListAsync(cancellationToken);

        var lessonViews = lessons
            .Where(l => l.IsActive || stats.ContainsKey(l.Id))
            .Select(l =>
            {
                var s = stats.GetValueOrDefault(l.Id);
                var answered = s?.Answered ?? 0;
                var correct = s?.Correct ?? 0;
                return new LessonStatsView(new LessonRefView(l.Id, l.Name), answered, correct, answered - correct, StatsRules.SuccessRate(answered, correct));
            })
            .ToList();

        var totalAnswered = byLesson.Sum(x => x.Answered);
        var totalCorrect = byLesson.Sum(x => x.Correct);
        var totals = new AnswerTotalsView(totalAnswered, totalCorrect, totalAnswered - totalCorrect, StatsRules.SuccessRate(totalAnswered, totalCorrect));

        var participation = await ParticipationAsync(studentUserId, TurkeyTime.ToLocalDate(student.CreatedAt), cancellationToken);

        var actor = new Actor(studentUserId, Roles.Ogrenci);
        var weekly = await StandingAsync(actor, LeaderboardPeriod.Weekly, cancellationToken);
        var monthly = await StandingAsync(actor, LeaderboardPeriod.Monthly, cancellationToken);

        var uploaded = await db.Questions.AsNoTracking()
            .CountAsync(q => q.AuthorUserId == studentUserId && q.Source == QuestionSource.Student, cancellationToken);
        var written = await db.Solutions.AsNoTracking()
            .CountAsync(s => s.AuthorUserId == studentUserId && s.Type == SolutionType.Student && !s.IsDeleted, cancellationToken);

        return ServiceResult<StudentStatsView>.Ok(new StudentStatsView(
            totals,
            lessonViews,
            participation,
            new PointsStatsView(student.Points, weekly, monthly),
            new ContributionStatsView(uploaded, written),
            await UploadTodayAsync(studentUserId, cancellationToken)));
    }

    private async Task<UploadTodayView> UploadTodayAsync(int userId, CancellationToken cancellationToken)
    {
        var today = clock.Today;
        var dailyLimit = Math.Max(0, await settings.GetIntAsync(SettingKeys.GunlukSoruYuklemeLimiti, cancellationToken));
        var points = Math.Max(0, await settings.GetIntAsync(SettingKeys.PuanSoruYukleme, cancellationToken));
        var perDay = Math.Max(0, await settings.GetIntAsync(SettingKeys.PuanliSoruYuklemeGunluk, cancellationToken));
        var uploaded = await db.CountUploadedAsync(userId, today, cancellationToken);
        var scoredToday = await db.CountScoredAsync(userId, today, cancellationToken);
        var scoredLimit = points > 0 ? perDay : 0;
        return new UploadTodayView(
            today,
            uploaded,
            dailyLimit,
            Math.Max(0, dailyLimit - uploaded),
            points,
            scoredLimit,
            scoredToday,
            Math.Max(0, scoredLimit - scoredToday));
    }

    private async Task<AssignmentParticipationView> ParticipationAsync(int userId, DateOnly joinedOn, CancellationToken cancellationToken)
    {
        var today = clock.Today;
        var rows = await db.Assignments.AsNoTracking()
            .Where(a => !a.IsDeleted && a.Status != AssignmentStatus.Draft && a.EndDate >= joinedOn)
            .Select(a => new
            {
                a.Status,
                a.StartDate,
                a.EndDate,
                Total = (
                    from aq in db.AssignmentQuestions
                    where aq.AssignmentId == a.Id
                    join q in db.Questions on aq.QuestionId equals q.Id
                    where !q.IsHidden
                    select aq.QuestionId).Count(),
                Answered = (
                    from an in db.Answers
                    where an.AssignmentId == a.Id && an.UserId == userId
                    join q in db.Questions on an.QuestionId equals q.Id
                    where !q.IsHidden
                    select an.Id).Count()
            })
            .ToListAsync(cancellationToken);

        int completed = 0, partial = 0, missed = 0, notStarted = 0;
        foreach (var row in rows)
        {
            var state = AssignmentState.Compute(row.Status, row.StartDate, row.EndDate, today);
            if (state is not (AssignmentEffectiveState.Open or AssignmentEffectiveState.Closed))
            {
                continue;
            }

            switch (StatsRules.Classify(row.Total, row.Answered, state == AssignmentEffectiveState.Closed))
            {
                case ParticipationStatus.Completed:
                    completed++;
                    break;
                case ParticipationStatus.Partial:
                    partial++;
                    break;
                case ParticipationStatus.Missed:
                    missed++;
                    break;
                case ParticipationStatus.NotStarted:
                    notStarted++;
                    break;
            }
        }

        return new AssignmentParticipationView(completed + partial + missed + notStarted, completed, partial, missed, notStarted);
    }

    private async Task<PeriodStandingView> StandingAsync(Actor actor, LeaderboardPeriod period, CancellationToken cancellationToken)
    {
        var result = await leaderboard.GetAsync(actor, period, 0, 1, cancellationToken);
        var me = result.Succeeded ? result.Value!.Me : null;
        return me is null ? new PeriodStandingView(0, null) : new PeriodStandingView(me.Points, me.Rank);
    }
}
