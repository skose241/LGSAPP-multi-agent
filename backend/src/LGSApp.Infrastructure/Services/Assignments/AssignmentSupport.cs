using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Assignments;

internal static class AssignmentText
{
    public static string? Clean(string? value)
    {
        var normalized = CommentRules.Normalize(value);
        return normalized.Length == 0 ? null : normalized;
    }

    public static string? CleanSingleLine(string? value)
    {
        var normalized = CommentRules.Normalize(value);
        if (normalized.Length == 0)
        {
            return null;
        }

        var parts = normalized.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return string.Join(' ', parts);
    }
}

internal sealed class ValidationErrors
{
    private readonly Dictionary<string, List<string>> items = [];

    public bool Any => items.Count > 0;

    public void Add(string key, string message)
    {
        if (!items.TryGetValue(key, out var list))
        {
            list = [];
            items[key] = list;
        }

        list.Add(message);
    }

    public void Merge(ValidationErrors other)
    {
        foreach (var (key, list) in other.items)
        {
            foreach (var message in list)
            {
                Add(key, message);
            }
        }
    }

    public Failure ToFailure(string message) =>
        Fail.Validation(message, items.ToDictionary(x => x.Key, x => x.Value.ToArray()));
}

internal static class AssignmentGate
{
    public const string NotFoundMessage = "Ödev bulunamadı.";
    public const string StaleMessage = "Ödev başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.";

    public static Task<Assignment?> LockAsync(AppDbContext db, int id, CancellationToken cancellationToken) =>
        db.Assignments
            .FromSqlInterpolated($"SELECT * FROM [Assignments] WITH (UPDLOCK, ROWLOCK) WHERE [Id] = {id} AND [IsDeleted] = 0")
            .FirstOrDefaultAsync(cancellationToken);

    public static bool CanModify(Actor actor, int teacherUserId) =>
        actor.IsMudur || (actor.IsTeacher && teacherUserId == actor.UserId);

    public static bool IsStale(Assignment assignment, byte[]? rowVersion) =>
        rowVersion is null || !assignment.RowVersion.AsSpan().SequenceEqual(rowVersion);

    public static Failure? ValidateDates(DateOnly start, DateOnly end, DateOnly today, bool startMustNotBePast)
    {
        if (startMustNotBePast && start < today)
        {
            return Fail.Validation("Başlangıç tarihi bugünden önce olamaz.");
        }

        var limit = today.AddYears(1);
        if (start > limit || end > limit)
        {
            return Fail.Validation(AssignmentRules.FutureLimitMessage);
        }

        if (end < start)
        {
            return Fail.Validation("Bitiş tarihi başlangıç tarihinden önce olamaz.");
        }

        if (end.DayNumber - start.DayNumber + 1 > AssignmentRules.MaxRangeDays)
        {
            return Fail.Validation($"Ödev süresi en fazla {AssignmentRules.MaxRangeDays} gün olabilir.");
        }

        return null;
    }
}

internal static class AssignmentCounting
{
    public static IQueryable<AssignmentQuestion> CountableQuestions(this AppDbContext db) =>
        db.AssignmentQuestions.Where(aq => db.Questions.Any(q => q.Id == aq.QuestionId && !q.IsHidden));

    public static IQueryable<Answer> CountableAnswers(this AppDbContext db) =>
        db.Answers.Where(an =>
            db.Questions.Any(q => q.Id == an.QuestionId && !q.IsHidden)
            && db.Users.Any(u => u.Id == an.UserId
                && !u.IsBanned
                && db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == Roles.OgrenciId)));
}
