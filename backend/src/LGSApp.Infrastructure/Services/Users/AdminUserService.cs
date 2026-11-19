using System.Globalization;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Users;

public sealed record UserProfileInput(string? FirstName, string? LastName, string? ClassName);

public sealed record BulkUserInput(string? UserName, string? FirstName, string? LastName, string? Role, string? ClassName, int? BranchLessonId);

public sealed record UpdatedUserResult(ApplicationUser User, string? Role);

public sealed record BulkCreatedUser(ApplicationUser User, string Role, string Password);

public sealed record AdminUserExtras(
    IReadOnlyDictionary<int, int> PendingReportCounts,
    IReadOnlyDictionary<int, UserRefView> BannedBy)
{
    public int PendingFor(int userId) => PendingReportCounts.GetValueOrDefault(userId);

    public UserRefView? BannedByFor(ApplicationUser user) =>
        user.BannedByUserId is { } id ? BannedBy.GetValueOrDefault(id) : null;
}

public interface IAdminUserService
{
    Task<ServiceResult<UpdatedUserResult>> UpdateProfileAsync(int id, UserProfileInput input, CancellationToken cancellationToken = default);
    Task<ServiceResult<IReadOnlyList<BulkCreatedUser>>> BulkCreateAsync(IReadOnlyList<BulkUserInput?> items, int? createdByUserId, CancellationToken cancellationToken = default);
    Task<AdminUserExtras> LoadExtrasAsync(IEnumerable<ApplicationUser> users, CancellationToken cancellationToken = default);
}

public static class UserInputRules
{
    public const int NameMaxLength = 100;
    public const int UserNameInputMaxLength = 100;
    public const int ClassNameMaxLength = 50;
    public const int BulkMinItems = 1;
    public const int BulkMaxItems = 100;
    public const string BranchOnlyForTeacherMessage = "Branş dersi yalnızca öğretmen hesaplarına atanabilir.";
    public const string BranchLessonNotFoundMessage = "Seçilen ders bulunamadı veya aktif değil.";
    public const string UserNameTakenMessage = "Bu kullanıcı adı zaten kayıtlı.";
    public const string ValidationTitle = "Bir veya daha fazla doğrulama hatası oluştu.";

    public static string UserNameInvalidDetail =>
        $"Kullanıcı adı {UserNameRules.MinLength}-{UserNameRules.MaxLength} karakter olmalı ve yalnızca harf (Türkçe harfler dahil), rakam, '.', '_' ve '-' içermelidir.";

    public static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed class AdminUserService(
    AppDbContext db,
    UserManager<ApplicationUser> userManager,
    UserLookupService lookup) : IAdminUserService
{
    private const string UserNotFound = "Kullanıcı bulunamadı.";
    private const string ConcurrencyMessage = "Kullanıcı başka biri tarafından değiştirilmiş. Yeniden deneyin.";

    public async Task<ServiceResult<UpdatedUserResult>> UpdateProfileAsync(int id, UserProfileInput input, CancellationToken cancellationToken = default)
    {
        var errors = new Dictionary<string, string[]>();
        var firstName = UserInputRules.NullIfBlank(input.FirstName);
        var lastName = UserInputRules.NullIfBlank(input.LastName);
        var className = UserInputRules.NullIfBlank(input.ClassName);

        if (firstName is null)
        {
            errors["firstName"] = ["Ad zorunludur."];
        }
        else if (firstName.Length > UserInputRules.NameMaxLength)
        {
            errors["firstName"] = [$"Ad en fazla {UserInputRules.NameMaxLength} karakter olabilir."];
        }

        if (lastName is null)
        {
            errors["lastName"] = ["Soyad zorunludur."];
        }
        else if (lastName.Length > UserInputRules.NameMaxLength)
        {
            errors["lastName"] = [$"Soyad en fazla {UserInputRules.NameMaxLength} karakter olabilir."];
        }

        if (className is not null && className.Length > UserInputRules.ClassNameMaxLength)
        {
            errors["className"] = [$"Sınıf en fazla {UserInputRules.ClassNameMaxLength} karakter olabilir."];
        }

        if (errors.Count > 0)
        {
            return Fail.Validation(UserInputRules.ValidationTitle, errors);
        }

        var user = await userManager.FindByIdAsync(id.ToString(CultureInfo.InvariantCulture));
        if (user is null)
        {
            return Fail.NotFound(UserNotFound);
        }

        var roles = await userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault();
        if (roles.Contains(Roles.Ai))
        {
            return Fail.Validation(SystemAccounts.ManagedMessage);
        }

        user.FirstName = firstName!;
        user.LastName = lastName!;
        user.ClassName = role == Roles.Ogrenci ? className : null;

        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            return result.Errors.Any(e => e.Code == nameof(IdentityErrorDescriber.ConcurrencyFailure))
                ? Fail.Conflict(ConcurrencyMessage)
                : Fail.Validation(string.Join(" ", result.Errors.Select(e => e.Description)));
        }

        return ServiceResult<UpdatedUserResult>.Ok(new UpdatedUserResult(user, role));
    }

    public async Task<ServiceResult<IReadOnlyList<BulkCreatedUser>>> BulkCreateAsync(IReadOnlyList<BulkUserInput?> items, int? createdByUserId, CancellationToken cancellationToken = default)
    {
        if (items.Count < UserInputRules.BulkMinItems || items.Count > UserInputRules.BulkMaxItems)
        {
            return Fail.Validation(
                UserInputRules.ValidationTitle,
                new Dictionary<string, string[]> { ["items"] = [$"Liste {UserInputRules.BulkMinItems} ile {UserInputRules.BulkMaxItems} kullanıcı içermelidir."] });
        }

        var errors = new Dictionary<string, List<string>>();
        void AddError(int index, string field, string message)
        {
            var key = $"items[{index}].{field}";
            if (!errors.TryGetValue(key, out var list))
            {
                list = [];
                errors[key] = list;
            }

            list.Add(message);
        }

        var rows = new List<BulkRow>();
        var seen = new Dictionary<string, int>(StringComparer.Ordinal);

        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
            if (item is null)
            {
                AddError(i, "userName", "Satır boş olamaz.");
                continue;
            }

            var valid = true;
            var userName = UserNameRules.Canonicalize(item.UserName);
            if (userName.Length == 0)
            {
                AddError(i, "userName", "Kullanıcı adı zorunludur.");
                valid = false;
            }
            else if (userName.Length > UserInputRules.UserNameInputMaxLength || !UserNameRules.IsValid(userName))
            {
                AddError(i, "userName", UserInputRules.UserNameInvalidDetail);
                valid = false;
            }
            else if (UserNameRules.IsReserved(userName))
            {
                AddError(i, "userName", UserNameRules.ReservedMessage);
                valid = false;
            }

            var firstName = UserInputRules.NullIfBlank(item.FirstName);
            if (firstName is null)
            {
                AddError(i, "firstName", "Ad zorunludur.");
                valid = false;
            }
            else if (firstName.Length > UserInputRules.NameMaxLength)
            {
                AddError(i, "firstName", $"Ad en fazla {UserInputRules.NameMaxLength} karakter olabilir.");
                valid = false;
            }

            var lastName = UserInputRules.NullIfBlank(item.LastName);
            if (lastName is null)
            {
                AddError(i, "lastName", "Soyad zorunludur.");
                valid = false;
            }
            else if (lastName.Length > UserInputRules.NameMaxLength)
            {
                AddError(i, "lastName", $"Soyad en fazla {UserInputRules.NameMaxLength} karakter olabilir.");
                valid = false;
            }

            var className = UserInputRules.NullIfBlank(item.ClassName);
            if (className is not null && className.Length > UserInputRules.ClassNameMaxLength)
            {
                AddError(i, "className", $"Sınıf en fazla {UserInputRules.ClassNameMaxLength} karakter olabilir.");
                valid = false;
            }

            var role = item.Role?.Trim().ToLowerInvariant() ?? string.Empty;
            if (role.Length == 0)
            {
                AddError(i, "role", "Rol zorunludur.");
                valid = false;
            }
            else if (!Roles.All.Contains(role))
            {
                AddError(i, "role", "Geçersiz rol. Geçerli roller: " + string.Join(", ", Roles.All));
                valid = false;
            }
            else if (role == Roles.Ai)
            {
                AddError(i, "role", SystemAccounts.ManagedMessage);
                valid = false;
            }
            else if (item.BranchLessonId is not null && role != Roles.Ogretmen)
            {
                AddError(i, "branchLessonId", UserInputRules.BranchOnlyForTeacherMessage);
                valid = false;
            }

            if (!valid)
            {
                continue;
            }

            var normalized = userManager.NormalizeName(userName) ?? userName;
            if (seen.TryGetValue(normalized, out var first))
            {
                AddError(i, "userName", $"Bu kullanıcı adı istekte yinelenmiş (satır {first + 1} ile aynı).");
                continue;
            }

            seen[normalized] = i;
            rows.Add(new BulkRow(i, userName, normalized, firstName!, lastName!, role, className, item.BranchLessonId));
        }

        if (rows.Count > 0)
        {
            var names = rows.Select(r => r.Normalized).ToList();
            var existing = await db.Users.AsNoTracking()
                .Where(u => names.Contains(u.NormalizedUserName!))
                .Select(u => u.NormalizedUserName!)
                .ToListAsync(cancellationToken);
            var taken = existing.ToHashSet(StringComparer.Ordinal);
            foreach (var row in rows.Where(r => taken.Contains(r.Normalized)))
            {
                AddError(row.Index, "userName", UserInputRules.UserNameTakenMessage);
            }

            var lessonIds = rows.Where(r => r.BranchLessonId is not null).Select(r => r.BranchLessonId!.Value).Distinct().ToList();
            if (lessonIds.Count > 0)
            {
                var active = (await db.Lessons.AsNoTracking()
                    .Where(l => lessonIds.Contains(l.Id) && l.IsActive)
                    .Select(l => l.Id)
                    .ToListAsync(cancellationToken)).ToHashSet();
                foreach (var row in rows.Where(r => r.BranchLessonId is { } id && !active.Contains(id)))
                {
                    AddError(row.Index, "branchLessonId", UserInputRules.BranchLessonNotFoundMessage);
                }
            }
        }

        if (errors.Count > 0)
        {
            return Fail.Validation(
                UserInputRules.ValidationTitle,
                errors.ToDictionary(p => p.Key, p => p.Value.ToArray()));
        }

        var passwords = rows.ToDictionary(r => r.Index, _ => PasswordGenerator.Generate());

        try
        {
            return await db.ExecuteInTransactionAsync<ServiceResult<IReadOnlyList<BulkCreatedUser>>>(async token =>
            {
                var created = new List<BulkCreatedUser>(rows.Count);
                foreach (var row in rows)
                {
                    var candidate = new ApplicationUser
                    {
                        UserName = row.UserName,
                        FirstName = row.FirstName,
                        LastName = row.LastName,
                        ClassName = row.ClassName,
                        MustChangePassword = true,
                        CreatedAt = DateTime.UtcNow,
                        CreatedByUserId = createdByUserId,
                        BranchLessonId = row.BranchLessonId
                    };

                    var result = await userManager.CreateAsync(candidate, passwords[row.Index]);
                    if (result.Succeeded)
                    {
                        result = await userManager.AddToRoleAsync(candidate, row.Role);
                    }

                    if (!result.Succeeded)
                    {
                        var message = string.Join(" ", result.Errors.Select(e => e.Description));
                        return Fail.Validation(
                            UserInputRules.ValidationTitle,
                            new Dictionary<string, string[]> { [$"items[{row.Index}].userName"] = [message] });
                    }

                    created.Add(new BulkCreatedUser(candidate, row.Role, passwords[row.Index]));
                }

                return ServiceResult<IReadOnlyList<BulkCreatedUser>>.Ok(created);
            }, cancellationToken);
        }
        catch (DbUpdateException)
        {
            return Fail.Conflict(UserInputRules.UserNameTakenMessage);
        }
    }

    public async Task<AdminUserExtras> LoadExtrasAsync(IEnumerable<ApplicationUser> users, CancellationToken cancellationToken = default)
    {
        var list = users.ToList();
        if (list.Count == 0)
        {
            return new AdminUserExtras(new Dictionary<int, int>(), new Dictionary<int, UserRefView>());
        }

        var ids = list.Select(u => u.Id).ToList();
        var pending = await db.Reports.AsNoTracking()
            .Where(r => r.Status == ReportStatus.Pending && ids.Contains(r.ReportedUserId))
            .GroupBy(r => r.ReportedUserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, cancellationToken);

        var bannerIds = list.Where(u => u.BannedByUserId is not null).Select(u => u.BannedByUserId!.Value).Distinct().ToList();
        var banners = await lookup.GetAsync(bannerIds, true, cancellationToken);
        return new AdminUserExtras(pending, banners);
    }

    private sealed record BulkRow(int Index, string UserName, string Normalized, string FirstName, string LastName, string Role, string? ClassName, int? BranchLessonId);
}
