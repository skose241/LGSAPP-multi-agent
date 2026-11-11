using System.Security.Claims;
using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private const string ForgotPasswordMessage = "Talebiniz okul yönetimine iletildi.";

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ITokenService _tokenService;
    private readonly DummyPasswordVerifier _dummyVerifier;
    private readonly AppDbContext _db;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        ITokenService tokenService,
        DummyPasswordVerifier dummyVerifier,
        AppDbContext db,
        ILogger<AuthController> logger)
    {
        _userManager = userManager;
        _tokenService = tokenService;
        _dummyVerifier = dummyVerifier;
        _db = db;
        _logger = logger;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitingExtensions.LoginPolicy)]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request)
    {
        var userName = request.UserName.Trim();
        var user = await _userManager.FindByNameAsync(userName);
        var isSystemAccount = await IsSystemAccountAsync(user?.Id ?? 0);
        if (user is null || isSystemAccount || user.PasswordHash is null)
        {
            _dummyVerifier.Verify(request.Password);
            await PadFailureWriteAsync();
            return InvalidCredentials();
        }

        if (await _userManager.IsLockedOutAsync(user))
        {
            _dummyVerifier.Verify(request.Password);
            await PadFailureWriteAsync();
            return InvalidCredentials();
        }

        if (!await _userManager.CheckPasswordAsync(user, request.Password))
        {
            await _userManager.AccessFailedAsync(user);
            return InvalidCredentials();
        }

        if (user.IsBanned)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Hesap engellenmiş.");
        }

        user.LastLoginAt = DateTime.UtcNow;
        await _userManager.ResetAccessFailedCountAsync(user);
        var update = await _userManager.UpdateAsync(user);
        if (!update.Succeeded)
        {
            return IdentityProblem(update);
        }

        return Ok(await BuildLoginResponse(user));
    }

    [HttpPost("change-password")]
    [Authorize(Policy = Policies.AuthenticatedAllowPasswordChange)]
    public async Task<ActionResult<LoginResponse>> ChangePassword(ChangePasswordRequest request)
    {
        var user = await GetCurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        if (request.CurrentPassword == request.NewPassword)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Yeni şifre mevcut şifreden farklı olmalı.");
        }

        user.MustChangePassword = false;
        var result = await _userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            return IdentityProblem(result);
        }

        var stamp = await _userManager.UpdateSecurityStampAsync(user);
        if (!stamp.Succeeded)
        {
            return IdentityProblem(stamp);
        }

        return Ok(await BuildLoginResponse(user));
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitingExtensions.ForgotPasswordPolicy)]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken cancellationToken)
    {
        var userName = request.UserName.Trim();
        var user = await _userManager.FindByNameAsync(userName);
        var written = false;
        var queried = false;
        if (user is not null && !user.IsBanned && !await IsSystemAccountAsync(user.Id))
        {
            queried = true;
            var hasPending = await _db.PasswordResetRequests
                .AnyAsync(r => r.UserId == user.Id && r.Status == PasswordResetStatus.Pending, cancellationToken);
            if (!hasPending)
            {
                written = true;
                _db.PasswordResetRequests.Add(new PasswordResetRequest
                {
                    UserId = user.Id,
                    Status = PasswordResetStatus.Pending,
                    CreatedAt = DateTime.UtcNow
                });

                try
                {
                    await _db.SaveChangesAsync(cancellationToken);
                }
                catch (DbUpdateException ex)
                {
                    _logger.LogWarning(ex, "Şifre sıfırlama talebi kaydedilemedi (eşzamanlı talep olabilir).");
                }
            }
        }

        if (!queried)
        {
            await _db.PasswordResetRequests
                .AnyAsync(r => r.UserId == 0 && r.Status == PasswordResetStatus.Pending, cancellationToken);
        }

        if (!written)
        {
            await _db.PasswordResetRequests
                .Where(r => r.Id == 0)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, PasswordResetStatus.Pending), cancellationToken);
        }

        return Ok(new { message = ForgotPasswordMessage });
    }

    [HttpGet("me")]
    [Authorize(Policy = Policies.AuthenticatedAllowPasswordChange)]
    public async Task<ActionResult<UserInfoDto>> Me()
    {
        var user = await GetCurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(await ToUserInfo(user));
    }

    private Task<int> PadFailureWriteAsync() =>
        _db.Users.Where(u => u.Id == 0).ExecuteUpdateAsync(s => s.SetProperty(u => u.AccessFailedCount, 0));

    private Task<bool> IsSystemAccountAsync(int userId) =>
        _db.UserRoles.AnyAsync(ur => ur.UserId == userId && ur.RoleId == Roles.AiId);

    private async Task<ApplicationUser?> GetCurrentUser()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return id is null ? null : await _userManager.FindByIdAsync(id);
    }

    private async Task<UserInfoDto> ToUserInfo(ApplicationUser user)
    {
        var roles = await _userManager.GetRolesAsync(user);
        return new UserInfoDto(
            user.Id,
            user.UserName ?? string.Empty,
            user.FirstName,
            user.LastName,
            user.ClassName,
            roles.FirstOrDefault() ?? string.Empty,
            user.MustChangePassword);
    }

    private async Task<LoginResponse> BuildLoginResponse(ApplicationUser user)
    {
        var roles = await _userManager.GetRolesAsync(user);
        var token = _tokenService.CreateToken(user, roles);
        return new LoginResponse(token.Token, token.ExpiresAtUtc, user.MustChangePassword, await ToUserInfo(user));
    }

    private ObjectResult InvalidCredentials() =>
        Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Kullanıcı adı veya şifre hatalı.");

    private ObjectResult IdentityProblem(IdentityResult result) =>
        Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "İşlem başarısız.",
            detail: string.Join(" ", result.Errors.Select(e => e.Description)));
}
