using System.Globalization;
using System.Security.Claims;
using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Users;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize(Policy = Policies.MudurOnly)]
public class AdminUsersController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly OneTimePasswordService _oneTimePasswords;
    private readonly AppDbContext _db;
    private readonly IAdminUserService _adminUsers;

    public AdminUsersController(UserManager<ApplicationUser> userManager, OneTimePasswordService oneTimePasswords, AppDbContext db, IAdminUserService adminUsers)
    {
        _userManager = userManager;
        _oneTimePasswords = oneTimePasswords;
        _db = db;
        _adminUsers = adminUsers;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AdminUserDto>>> List([FromQuery] string? role, [FromQuery] bool? reported, CancellationToken cancellationToken)
    {
        var query = UserRows();

        if (!string.IsNullOrWhiteSpace(role))
        {
            var normalized = role.Trim().ToLowerInvariant();
            query = query.Where(x => x.RoleName == normalized);
        }

        if (reported == true)
        {
            query = query.Where(x => _db.Reports.Any(r => r.ReportedUserId == x.User.Id && r.Status == ReportStatus.Pending));
        }

        var rows = await query.OrderBy(x => x.User.Id).ToListAsync(cancellationToken);
        var names = await LessonNamesAsync(cancellationToken);
        var extras = await _adminUsers.LoadExtrasAsync(rows.Select(x => x.User), cancellationToken);
        return Ok(rows.Select(x => ToDto(x.User, x.RoleName, names, extras)));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AdminUserDto>> Get(int id, CancellationToken cancellationToken)
    {
        var row = await UserRows().Where(x => x.User.Id == id).FirstOrDefaultAsync(cancellationToken);
        if (row is null)
        {
            return NotFound();
        }

        var names = await LessonNamesAsync(cancellationToken);
        var extras = await _adminUsers.LoadExtrasAsync([row.User], cancellationToken);
        return Ok(ToDto(row.User, row.RoleName, names, extras));
    }

    [HttpPut("{id:int}/branch-lesson")]
    public async Task<ActionResult<AdminUserDto>> SetBranchLesson(int id, UpdateBranchLessonRequest request, CancellationToken cancellationToken)
    {
        var user = await _userManager.FindByIdAsync(id.ToString(CultureInfo.InvariantCulture));
        if (user is null)
        {
            return NotFound();
        }

        if (!await _userManager.IsInRoleAsync(user, Roles.Ogretmen))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: BranchOnlyForTeacherMessage);
        }

        if (request.BranchLessonId is { } lessonId && !await LessonExistsAsync(lessonId, cancellationToken))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: BranchLessonNotFoundMessage);
        }

        user.BranchLessonId = request.BranchLessonId;
        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            return result.Errors.Any(e => e.Code == nameof(IdentityErrorDescriber.ConcurrencyFailure))
                ? Problem(statusCode: StatusCodes.Status409Conflict, title: "Kullanıcı başka biri tarafından değiştirilmiş. Yeniden deneyin.")
                : IdentityProblem(result);
        }

        var names = await LessonNamesAsync(cancellationToken);
        var extras = await _adminUsers.LoadExtrasAsync([user], cancellationToken);
        return Ok(ToDto(user, Roles.Ogretmen, names, extras));
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType<AdminUserDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateProfile(int id, UpdateUserProfileRequest request, CancellationToken cancellationToken)
    {
        var result = await _adminUsers.UpdateProfileAsync(id, new UserProfileInput(request.FirstName, request.LastName, request.ClassName), cancellationToken);
        if (!result.Succeeded)
        {
            return result.ToActionResult(this);
        }

        var updated = result.Value!;
        var names = await LessonNamesAsync(cancellationToken);
        var extras = await _adminUsers.LoadExtrasAsync([updated.User], cancellationToken);
        return Ok(ToDto(updated.User, updated.Role, names, extras));
    }

    [HttpPost("bulk")]
    [EnableRateLimiting(RateLimitingExtensions.BulkUserCreatePolicy)]
    [ProducesResponseType<BulkCreatedUsersResponse>(StatusCodes.Status201Created)]
    public async Task<IActionResult> BulkCreate(BulkCreateUsersRequest request, CancellationToken cancellationToken)
    {
        var items = (request.Items ?? [])
            .Select(i => i is null ? null : new BulkUserInput(i.UserName, i.FirstName, i.LastName, i.Role, i.ClassName, i.BranchLessonId))
            .ToList();
        var result = await _adminUsers.BulkCreateAsync(items, CurrentUserId(), cancellationToken);
        if (!result.Succeeded)
        {
            return result.ToActionResult(this);
        }

        var created = result.Value!;
        var names = await LessonNamesAsync(cancellationToken);
        var extras = await _adminUsers.LoadExtrasAsync(created.Select(c => c.User), cancellationToken);
        var users = created
            .Select(c => new CreatedUserResponse(ToDto(c.User, c.Role, names, extras), c.Password))
            .ToList();
        return CreatedAtAction(nameof(List), new BulkCreatedUsersResponse(users));
    }

    [HttpPost]
    [ProducesResponseType<CreatedUserResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<CreatedUserResponse>> Create(CreateUserRequest request, CancellationToken cancellationToken)
    {
        var role = request.Role.Trim().ToLowerInvariant();
        if (!Roles.All.Contains(role))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Geçersiz rol.", detail: "Geçerli roller: " + string.Join(", ", Roles.All));
        }

        if (role == Roles.Ai)
        {
            return SystemAccountProblem();
        }

        if (request.BranchLessonId is { } branchLessonId)
        {
            if (role != Roles.Ogretmen)
            {
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: BranchOnlyForTeacherMessage);
            }

            if (!await LessonExistsAsync(branchLessonId, cancellationToken))
            {
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: BranchLessonNotFoundMessage);
            }
        }

        var userName = UserNameRules.Canonicalize(request.UserName);
        if (!UserNameRules.IsValid(userName))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Geçersiz kullanıcı adı.",
                detail: $"Kullanıcı adı {UserNameRules.MinLength}-{UserNameRules.MaxLength} karakter olmalı ve yalnızca harf (Türkçe harfler dahil), rakam, '.', '_' ve '-' içermelidir.");
        }

        if (UserNameRules.IsReserved(userName))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Geçersiz kullanıcı adı.", detail: UserNameRules.ReservedMessage);
        }

        if (await _userManager.FindByNameAsync(userName) is not null)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, title: "Bu kullanıcı adı zaten kayıtlı.");
        }

        var password = PasswordGenerator.Generate();
        var createdBy = CurrentUserId();
        ApplicationUser? user = null;
        IdentityResult? failure = null;

        var strategy = _db.Database.CreateExecutionStrategy();
        try
        {
            await strategy.ExecuteAsync(async () =>
            {
                failure = null;
                user = null;
                _db.ChangeTracker.Clear();

                await using var transaction = await _db.Database.BeginTransactionAsync();

                var candidate = new ApplicationUser
                {
                    UserName = userName,
                    FirstName = request.FirstName.Trim(),
                    LastName = request.LastName.Trim(),
                    ClassName = role == Roles.Ogrenci && !string.IsNullOrWhiteSpace(request.ClassName) ? request.ClassName.Trim() : null,
                    MustChangePassword = true,
                    CreatedAt = DateTime.UtcNow,
                    CreatedByUserId = createdBy,
                    BranchLessonId = request.BranchLessonId
                };

                var created = await _userManager.CreateAsync(candidate, password);
                if (!created.Succeeded)
                {
                    failure = created;
                    return;
                }

                var added = await _userManager.AddToRoleAsync(candidate, role);
                if (!added.Succeeded)
                {
                    failure = added;
                    return;
                }

                await transaction.CommitAsync();
                user = candidate;
            });
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation())
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, title: "Bu kullanıcı adı zaten kayıtlı.");
        }

        if (user is null)
        {
            return IdentityProblem(failure ?? IdentityResult.Failed());
        }

        var lessonNames = await LessonNamesAsync(cancellationToken);
        var extras = await _adminUsers.LoadExtrasAsync([user], cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = user.Id }, new CreatedUserResponse(ToDto(user, role, lessonNames, extras), password));
    }

    [HttpPost("{id:int}/ban")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Ban(int id) => await SetBan(id, true);

    [HttpPost("{id:int}/unban")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Unban(int id) => await SetBan(id, false);

    [HttpPost("{id:int}/regenerate-password")]
    public async Task<ActionResult<OneTimePasswordResponse>> RegeneratePassword(int id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString(CultureInfo.InvariantCulture));
        if (user is null)
        {
            return NotFound();
        }

        if (await _userManager.IsInRoleAsync(user, Roles.Ai))
        {
            return SystemAccountProblem();
        }

        var outcome = await _oneTimePasswords.ResetAsync(user, true);
        if (!outcome.Result.Succeeded)
        {
            return outcome.Result.Errors.Any(e => e.Code == MudurRules.PasswordResetForbiddenCode)
                ? Problem(statusCode: StatusCodes.Status400BadRequest, title: MudurRules.PasswordResetForbiddenMessage)
                : IdentityProblem(outcome.Result);
        }

        return Ok(new OneTimePasswordResponse(user.Id, outcome.Password, user.MustChangePassword));
    }

    private async Task<IActionResult> SetBan(int id, bool banned)
    {
        if (banned && id == CurrentUserId())
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Kendi hesabınızı engelleyemezsiniz.");
        }

        var user = await _userManager.FindByIdAsync(id.ToString(CultureInfo.InvariantCulture));
        if (user is null)
        {
            return NotFound();
        }

        if (await _userManager.IsInRoleAsync(user, Roles.Ai))
        {
            return SystemAccountProblem();
        }

        var result = await _userManager.SetBannedAsync(user, banned, CurrentUserId());
        if (!result.Succeeded)
        {
            return result.Errors.Any(e => e.Code == SystemAccounts.MudurBanErrorCode)
                ? Problem(statusCode: StatusCodes.Status400BadRequest, title: SystemAccounts.MudurBanMessage)
                : IdentityProblem(result);
        }

        return NoContent();
    }

    private IQueryable<UserRow> UserRows() =>
        from u in _db.Users.AsNoTracking()
        join ur in _db.UserRoles on u.Id equals ur.UserId into urs
        from ur in urs.DefaultIfEmpty()
        join r in _db.Roles on ur.RoleId equals r.Id into rs
        from r in rs.DefaultIfEmpty()
        select new UserRow { User = u, RoleName = r.Name };

    private int? CurrentUserId() =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) ? id : null;

    private const string BranchOnlyForTeacherMessage = "Branş dersi yalnızca öğretmen hesaplarına atanabilir.";
    private const string BranchLessonNotFoundMessage = "Seçilen ders bulunamadı veya aktif değil.";

    private Task<bool> LessonExistsAsync(int lessonId, CancellationToken cancellationToken) =>
        _db.Lessons.AsNoTracking().AnyAsync(l => l.Id == lessonId && l.IsActive, cancellationToken);

    private Task<Dictionary<int, string>> LessonNamesAsync(CancellationToken cancellationToken) =>
        _db.Lessons.AsNoTracking().ToDictionaryAsync(l => l.Id, l => l.Name, cancellationToken);

    private static AdminUserDto ToDto(ApplicationUser u, string? role, IReadOnlyDictionary<int, string> lessonNames, AdminUserExtras extras) =>
        new(
            u.Id,
            u.UserName ?? string.Empty,
            u.FirstName,
            u.LastName,
            u.ClassName,
            role,
            u.IsBanned,
            u.MustChangePassword,
            u.CreatedAt,
            u.LastLoginAt,
            u.CreatedByUserId,
            role == Roles.Ai,
            u.BranchLessonId,
            u.BranchLessonId is { } lessonId ? lessonNames.GetValueOrDefault(lessonId) : null,
            u.BannedAt,
            extras.BannedByFor(u),
            extras.PendingFor(u.Id));

    private ObjectResult SystemAccountProblem() =>
        Problem(statusCode: StatusCodes.Status400BadRequest, title: SystemAccounts.ManagedMessage);

    private ObjectResult IdentityProblem(IdentityResult result) =>
        Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "İşlem başarısız.",
            detail: string.Join(" ", result.Errors.Select(e => e.Description)));

    private sealed class UserRow
    {
        public ApplicationUser User { get; set; } = null!;
        public string? RoleName { get; set; }
    }
}
