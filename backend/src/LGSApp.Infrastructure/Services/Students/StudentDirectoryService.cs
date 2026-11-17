using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Stats;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Students;

public static class StudentSortKeys
{
    public const string Name = "name";
    public const string Points = "points";
    public const string Answered = "answered";
    public const string LastActive = "lastActive";

    public static string? Normalize(string? sort)
    {
        if (string.IsNullOrWhiteSpace(sort))
        {
            return Name;
        }

        foreach (var key in new[] { Name, Points, Answered, LastActive })
        {
            if (string.Equals(key, sort.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                return key;
            }
        }

        return null;
    }
}

public static class StudentDirectoryRules
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;
    public const int MaxSearchLength = 100;
}

public sealed record StudentListQuery(string? Search, string? Sort, int Page, int PageSize);

public sealed record StudentListItemView(
    int Id,
    string UserName,
    string FullName,
    bool IsBanned,
    int Points,
    int Answered,
    int Correct,
    int Wrong,
    double? SuccessRate,
    DateTime? LastAnsweredAt,
    DateTime CreatedAt);

public sealed record StudentListView(int Page, int PageSize, int TotalCount, string Sort, IReadOnlyList<StudentListItemView> Items);

public sealed record StudentHeaderView(int Id, string UserName, string FullName, bool IsBanned, DateTime CreatedAt);

public sealed record StudentProfileStatsView(StudentHeaderView Student, StudentStatsView Stats);

public interface IStudentDirectoryService
{
    Task<ServiceResult<StudentListView>> ListAsync(Actor actor, StudentListQuery query, CancellationToken cancellationToken = default);
    Task<ServiceResult<StudentProfileStatsView>> GetStatsAsync(Actor actor, int studentId, CancellationToken cancellationToken = default);
}

public sealed class StudentDirectoryService(AppDbContext db, IStudentStatsService stats) : IStudentDirectoryService
{
    public async Task<ServiceResult<StudentListView>> ListAsync(Actor actor, StudentListQuery query, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden(AnswerKeyScope.ModeratorOnlyMessage);
        }

        var sort = StudentSortKeys.Normalize(query.Sort);
        if (sort is null)
        {
            return Fail.Validation("Sıralama 'name', 'points', 'answered' veya 'lastActive' olmalıdır.");
        }

        if (query.Page < 1)
        {
            return Fail.Validation("Sayfa numarası 1 veya daha büyük olmalıdır.");
        }

        if (query.PageSize < 1 || query.PageSize > StudentDirectoryRules.MaxPageSize)
        {
            return Fail.Validation($"Sayfa boyutu 1 ile {StudentDirectoryRules.MaxPageSize} arasında olmalıdır.");
        }

        var search = query.Search?.Trim();
        if (search is { Length: > StudentDirectoryRules.MaxSearchLength })
        {
            return Fail.Validation($"Arama metni en fazla {StudentDirectoryRules.MaxSearchLength} karakter olabilir.");
        }

        var rows =
            from u in db.Users.AsNoTracking()
            where db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == Roles.OgrenciId)
            select new
            {
                u.Id,
                UserName = u.UserName ?? string.Empty,
                u.FirstName,
                u.LastName,
                u.IsBanned,
                u.Points,
                u.CreatedAt,
                Answered = db.Answers.Count(a => a.UserId == u.Id),
                Correct = db.Answers.Count(a => a.UserId == u.Id && a.IsCorrect),
                LastAnsweredAt = db.Answers.Where(a => a.UserId == u.Id).Max(a => (DateTime?)a.AnsweredAt)
            };

        if (!string.IsNullOrEmpty(search))
        {
            rows = rows.Where(r => r.UserName.Contains(search)
                || r.FirstName.Contains(search)
                || r.LastName.Contains(search)
                || (r.FirstName + " " + r.LastName).Contains(search));
        }

        var total = await rows.CountAsync(cancellationToken);
        var offset = (long)(query.Page - 1) * query.PageSize;
        if (offset >= total)
        {
            return ServiceResult<StudentListView>.Ok(new StudentListView(query.Page, query.PageSize, total, sort, []));
        }

        var ordered = sort switch
        {
            StudentSortKeys.Points => rows.OrderByDescending(r => r.Points).ThenBy(r => r.UserName),
            StudentSortKeys.Answered => rows.OrderByDescending(r => r.Answered).ThenBy(r => r.UserName),
            StudentSortKeys.LastActive => rows.OrderBy(r => r.LastAnsweredAt == null).ThenByDescending(r => r.LastAnsweredAt).ThenBy(r => r.UserName),
            _ => rows.OrderBy(r => r.UserName)
        };

        var page = await ordered
            .ThenBy(r => r.Id)
            .Skip((int)offset)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        var items = page
            .Select(r => new StudentListItemView(
                r.Id,
                r.UserName,
                $"{r.FirstName} {r.LastName}".Trim(),
                r.IsBanned,
                r.Points,
                r.Answered,
                r.Correct,
                r.Answered - r.Correct,
                StatsRules.SuccessRate(r.Answered, r.Correct),
                r.LastAnsweredAt,
                r.CreatedAt))
            .ToList();

        return ServiceResult<StudentListView>.Ok(new StudentListView(query.Page, query.PageSize, total, sort, items));
    }

    public async Task<ServiceResult<StudentProfileStatsView>> GetStatsAsync(Actor actor, int studentId, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden(AnswerKeyScope.ModeratorOnlyMessage);
        }

        var header = await db.Users.AsNoTracking()
            .Where(u => u.Id == studentId && db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == Roles.OgrenciId))
            .Select(u => new { u.Id, u.UserName, u.FirstName, u.LastName, u.IsBanned, u.CreatedAt })
            .FirstOrDefaultAsync(cancellationToken);
        if (header is null)
        {
            return Fail.NotFound("Öğrenci bulunamadı.");
        }

        var result = await stats.GetAsync(studentId, cancellationToken);
        if (!result.Succeeded)
        {
            return ServiceResult<StudentProfileStatsView>.From(result);
        }

        return ServiceResult<StudentProfileStatsView>.Ok(new StudentProfileStatsView(
            new StudentHeaderView(header.Id, header.UserName ?? string.Empty, $"{header.FirstName} {header.LastName}".Trim(), header.IsBanned, header.CreatedAt),
            result.Value!));
    }
}
