using System.Globalization;
using System.Security.Claims;
using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
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

    public AdminUsersController(UserManager<ApplicationUser> userManager, OneTimePasswordService oneTimePasswords, AppDbContext db)
    {
        _userManager = userManager;
        _oneTimePasswords = oneTimePasswords;
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AdminUserDto>>> List([FromQuery] string? role, CancellationToken cancellationToken)
    {
        var query = UserRows();

        if (!string.IsNullOrWhiteSpace(role))
        {
            var normalized = role.Trim().ToLowerInvariant();
            query = query.Where(x => x.RoleName == normalized);
        }

        var rows = await query.OrderBy(x => x.User.Id).ToListAsync(cancellationToken);
        return Ok(rows.Select(x => ToDto(x.User, x.RoleName)));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AdminUserDto>> Get(int id, CancellationToken cancellationToken)
    {
        var row = await UserRows().Where(x => x.User.Id == id).FirstOrDefaultAsync(cancellationToken);
        return row is null ? NotFound() : Ok(ToDto(row.User, row.RoleName));
    }

    [HttpPost]
    public async Task<ActionResult<CreatedUserResponse>> Create(CreateUserRequest request)
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

        var userName = request.UserName.Trim();
        if (!UserNameRules.IsValid(userName))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Geçersiz kullanıcı adı.",
                detail: $"Kullanıcı adı {UserNameRules.MinLength}-{UserNameRules.MaxLength} karakter olmalı ve yalnızca harf, rakam, '.', '_' ve '-' içermelidir.");
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
                    ClassName = string.IsNullOrWhiteSpace(request.ClassName) ? null : request.ClassName.Trim(),
                    MustChangePassword = true,
                    CreatedAt = DateTime.UtcNow,
                    CreatedByUserId = createdBy
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
        catch (DbUpdateException)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, title: "Bu kullanıcı adı zaten kayıtlı.");
        }

        if (user is null)
        {
            return IdentityProblem(failure ?? IdentityResult.Failed());
        }

        return CreatedAtAction(nameof(Get), new { id = user.Id }, new CreatedUserResponse(ToDto(user, role), password));
    }

    [HttpPost("{id:int}/ban")]
    public async Task<IActionResult> Ban(int id) => await SetBan(id, true);

    [HttpPost("{id:int}/unban")]
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
            return IdentityProblem(outcome.Result);
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

        user.IsBanned = banned;
        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            return IdentityProblem(result);
        }

        var stamp = await _userManager.UpdateSecurityStampAsync(user);
        if (!stamp.Succeeded)
        {
            return IdentityProblem(stamp);
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

    private static AdminUserDto ToDto(ApplicationUser u, string? role) =>
        new(u.Id, u.UserName ?? string.Empty, u.FirstName, u.LastName, u.ClassName, role, u.IsBanned, u.MustChangePassword, u.CreatedAt, u.LastLoginAt, u.CreatedByUserId, role == Roles.Ai);

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
