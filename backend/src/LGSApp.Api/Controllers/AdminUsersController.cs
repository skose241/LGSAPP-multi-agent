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
    private readonly AppDbContext _db;

    public AdminUsersController(UserManager<ApplicationUser> userManager, AppDbContext db)
    {
        _userManager = userManager;
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AdminUserDto>>> List([FromQuery] string? role, CancellationToken cancellationToken)
    {
        var query =
            from u in _db.Users.AsNoTracking()
            join ur in _db.UserRoles on u.Id equals ur.UserId into urs
            from ur in urs.DefaultIfEmpty()
            join r in _db.Roles on ur.RoleId equals r.Id into rs
            from r in rs.DefaultIfEmpty()
            select new { User = u, RoleName = r.Name };

        if (!string.IsNullOrWhiteSpace(role))
        {
            var normalized = role.ToLowerInvariant();
            query = query.Where(x => x.RoleName == normalized);
        }

        var rows = await query.OrderBy(x => x.User.Id).ToListAsync(cancellationToken);
        return Ok(rows.Select(x => ToDto(x.User, x.RoleName)));
    }

    [HttpPost]
    public async Task<ActionResult<CreatedUserResponse>> Create(CreateUserRequest request)
    {
        var role = request.Role.Trim().ToLowerInvariant();
        if (!Roles.All.Contains(role))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Gecersiz rol.", detail: "Gecerli roller: " + string.Join(", ", Roles.All));
        }

        if (await _userManager.FindByNameAsync(request.UserName) is not null)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, title: "Bu kullanici adi zaten kayitli.");
        }

        var password = PasswordGenerator.Generate();
        var user = new ApplicationUser
        {
            UserName = request.UserName.Trim(),
            Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim(),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            ClassName = string.IsNullOrWhiteSpace(request.ClassName) ? null : request.ClassName.Trim(),
            MustChangePassword = role != Roles.Ai,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = CurrentUserId()
        };

        var created = await _userManager.CreateAsync(user, password);
        if (!created.Succeeded)
        {
            return IdentityProblem(created);
        }

        var added = await _userManager.AddToRoleAsync(user, role);
        if (!added.Succeeded)
        {
            await _userManager.DeleteAsync(user);
            return IdentityProblem(added);
        }

        return CreatedAtAction(nameof(List), new CreatedUserResponse(ToDto(user, role), password));
    }

    [HttpPost("{id:int}/ban")]
    public async Task<IActionResult> Ban(int id) => await SetBan(id, true);

    [HttpPost("{id:int}/unban")]
    public async Task<IActionResult> Unban(int id) => await SetBan(id, false);

    [HttpPost("{id:int}/regenerate-password")]
    public async Task<ActionResult<OneTimePasswordResponse>> RegeneratePassword(int id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }

        var roles = await _userManager.GetRolesAsync(user);
        var password = PasswordGenerator.Generate();
        var token = await _userManager.GeneratePasswordResetTokenAsync(user);
        var result = await _userManager.ResetPasswordAsync(user, token, password);
        if (!result.Succeeded)
        {
            return IdentityProblem(result);
        }

        user.MustChangePassword = !roles.Contains(Roles.Ai);
        await _userManager.UpdateAsync(user);
        await _userManager.ResetAccessFailedCountAsync(user);

        return Ok(new OneTimePasswordResponse(user.Id, password, user.MustChangePassword));
    }

    private async Task<IActionResult> SetBan(int id, bool banned)
    {
        if (banned && id == CurrentUserId())
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Kendi hesabinizi engelleyemezsiniz.");
        }

        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }

        user.IsBanned = banned;
        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            return IdentityProblem(result);
        }

        await _userManager.UpdateSecurityStampAsync(user);
        return NoContent();
    }

    private int? CurrentUserId() =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    private static AdminUserDto ToDto(ApplicationUser u, string? role) =>
        new(u.Id, u.UserName ?? string.Empty, u.FirstName, u.LastName, u.Email, u.ClassName, role, u.IsBanned, u.MustChangePassword, u.CreatedAt, u.CreatedByUserId);

    private ObjectResult IdentityProblem(IdentityResult result) =>
        Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Islem basarisiz.",
            detail: string.Join(" ", result.Errors.Select(e => e.Description)));
}
