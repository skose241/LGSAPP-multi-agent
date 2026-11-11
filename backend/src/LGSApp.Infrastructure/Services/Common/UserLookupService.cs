using LGSApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Common;

public sealed record UserRefView(int Id, string UserName, string Role, string? FullName);

public sealed class UserLookupService(AppDbContext db)
{
    public async Task<Dictionary<int, UserRefView>> GetAsync(IEnumerable<int> ids, bool includeFullName, CancellationToken cancellationToken = default)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0)
        {
            return [];
        }

        var rows = await (
            from u in db.Users.AsNoTracking().Where(u => list.Contains(u.Id))
            join ur in db.UserRoles on u.Id equals ur.UserId into urs
            from ur in urs.DefaultIfEmpty()
            join r in db.Roles on ur.RoleId equals r.Id into rs
            from r in rs.DefaultIfEmpty()
            select new { u.Id, u.UserName, u.FirstName, u.LastName, Role = r.Name }).ToListAsync(cancellationToken);

        return rows
            .GroupBy(x => x.Id)
            .Select(g => g.First())
            .ToDictionary(
                x => x.Id,
                x => new UserRefView(x.Id, x.UserName ?? string.Empty, x.Role ?? string.Empty, includeFullName ? $"{x.FirstName} {x.LastName}".Trim() : null));
    }
}
