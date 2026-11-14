using System.Diagnostics;
using System.Security.Claims;
using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Api.Options;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using LGSApp.Infrastructure.Services.RefreshTokens;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

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
    private readonly RecoveryCodeService _recoveryCodes;
    private readonly IRefreshTokenService _refreshTokens;
    private readonly ILogger<AuthController> _logger;
    private readonly ResponseTimingOptions _timing;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        ITokenService tokenService,
        DummyPasswordVerifier dummyVerifier,
        AppDbContext db,
        RecoveryCodeService recoveryCodes,
        IRefreshTokenService refreshTokens,
        ILogger<AuthController> logger,
        IOptions<ResponseTimingOptions> timing)
    {
        _userManager = userManager;
        _tokenService = tokenService;
        _dummyVerifier = dummyVerifier;
        _db = db;
        _recoveryCodes = recoveryCodes;
        _refreshTokens = refreshTokens;
        _logger = logger;
        _timing = timing.Value;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitingExtensions.LoginPolicy)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden, "application/problem+json")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();
        var userName = request.UserName.Trim();
        var user = await _userManager.FindByNameAsync(userName);
        var isSystemAccount = await IsSystemAccountAsync(user?.Id ?? 0);
        if (user is null || isSystemAccount || user.PasswordHash is null)
        {
            _dummyVerifier.Verify(request.Password);
            await PadFailureWriteAsync();
            return await FailLoginAsync(started, cancellationToken);
        }

        if (await _userManager.IsLockedOutAsync(user))
        {
            _dummyVerifier.Verify(request.Password);
            await PadFailureWriteAsync();
            return await FailLoginAsync(started, cancellationToken);
        }

        if (!await _userManager.CheckPasswordAsync(user, request.Password))
        {
            await _userManager.AccessFailedAsync(user);
            return await FailLoginAsync(started, cancellationToken);
        }

        if (user.IsBanned)
        {
            await WaitForMinimumAsync(started, _timing.LoginFailureMinMilliseconds, cancellationToken);
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
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId is null)
        {
            return Unauthorized();
        }

        if (request.CurrentPassword == request.NewPassword)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Yeni şifre mevcut şifreden farklı olmalı.");
        }

        ActionResult? error = null;
        LoginResponse? response = null;
        var strategy = _db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            error = null;
            response = null;
            _db.ChangeTracker.Clear();

            await using var transaction = await _db.Database.BeginTransactionAsync();
            var user = await _userManager.FindByIdAsync(userId);
            if (user is null)
            {
                error = Unauthorized();
                return;
            }

            var issueCodes = user.MustChangePassword && await _userManager.IsInRoleAsync(user, Roles.Mudur);
            user.MustChangePassword = false;
            var result = await _userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
            if (!result.Succeeded)
            {
                error = IdentityProblem(result);
                return;
            }

            var stamp = await _userManager.UpdateSecurityStampAsync(user);
            if (!stamp.Succeeded)
            {
                error = IdentityProblem(stamp);
                return;
            }

            IReadOnlyList<string>? codes = null;
            if (issueCodes)
            {
                codes = await _recoveryCodes.IssueAsync(user.Id);
            }

            response = await BuildLoginResponse(user, codes);
            await transaction.CommitAsync();
        });

        return error ?? Ok(response);
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitingExtensions.RefreshPolicy)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized, "application/problem+json")]
    public async Task<ActionResult<LoginResponse>> Refresh(RefreshRequest request, CancellationToken cancellationToken)
    {
        var rotation = await _refreshTokens.RotateAsync(request.RefreshToken.Trim(), cancellationToken);
        if (!rotation.Succeeded || rotation.User is null || rotation.Token is null)
        {
            return Problem(
                statusCode: StatusCodes.Status401Unauthorized,
                title: "Oturum yenilenemedi.",
                detail: "Oturumunuz sona erdi. Lütfen yeniden giriş yapın.");
        }

        var token = _tokenService.CreateToken(rotation.User, rotation.Roles);
        return Ok(new LoginResponse(
            token.Token,
            token.ExpiresAtUtc,
            rotation.User.MustChangePassword,
            await ToUserInfo(rotation.User),
            rotation.Token.Token,
            rotation.Token.ExpiresAtUtc));
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout([FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] LogoutRequest? request, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(request?.RefreshToken))
        {
            await _refreshTokens.RevokeFamilyAsync(request.RefreshToken.Trim(), CurrentUserId(), cancellationToken);
        }

        return NoContent();
    }

    [HttpPost("logout-all")]
    [Authorize(Policy = Policies.AuthenticatedAllowPasswordChange)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> LogoutAll(CancellationToken cancellationToken)
    {
        if (CurrentUserId() is not { } userId)
        {
            return Unauthorized();
        }

        var user = await _userManager.FindByIdAsync(userId.ToString(System.Globalization.CultureInfo.InvariantCulture));
        if (user is null)
        {
            return Unauthorized();
        }

        await _refreshTokens.RevokeAllAsync(userId, RefreshRevokeReasons.LogoutAll, cancellationToken);
        var stamp = await _userManager.UpdateSecurityStampAsync(user);
        if (!stamp.Succeeded)
        {
            return IdentityProblem(stamp);
        }

        return NoContent();
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitingExtensions.ForgotPasswordPolicy)]
    [ProducesResponseType<ForgotPasswordResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();
        var userName = request.UserName.Trim();
        var user = await _userManager.FindByNameAsync(userName);
        var written = false;
        var queried = false;
        if (user is not null && !user.IsBanned && !await IsRequestBlockedAsync(user.Id))
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

        await WaitForMinimumAsync(started, _timing.ForgotPasswordMinMilliseconds, cancellationToken);
        return Ok(new ForgotPasswordResponse(ForgotPasswordMessage));
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

    private async Task<ObjectResult> FailLoginAsync(long started, CancellationToken cancellationToken)
    {
        await WaitForMinimumAsync(started, _timing.LoginFailureMinMilliseconds, cancellationToken);
        return InvalidCredentials();
    }

    private static Task WaitForMinimumAsync(long started, int minimumMilliseconds, CancellationToken cancellationToken) =>
        ResponseTimer.WaitForMinimumAsync(started, minimumMilliseconds, cancellationToken);

    private Task<int> PadFailureWriteAsync() =>
        _db.Users.Where(u => u.Id == 0).ExecuteUpdateAsync(s => s.SetProperty(u => u.AccessFailedCount, 0));

    private Task<bool> IsSystemAccountAsync(int userId) =>
        _db.UserRoles.AnyAsync(ur => ur.UserId == userId && ur.RoleId == Roles.AiId);

    private Task<bool> IsRequestBlockedAsync(int userId) =>
        _db.UserRoles.AnyAsync(ur => ur.UserId == userId && (ur.RoleId == Roles.AiId || ur.RoleId == Roles.MudurId));

    private int? CurrentUserId() =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out var id) ? id : null;

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
            user.MustChangePassword,
            roles.Contains(Roles.Mudur) && await _recoveryCodes.RemainingAsync(user.Id) == 0);
    }

    private async Task<LoginResponse> BuildLoginResponse(ApplicationUser user, IReadOnlyList<string>? recoveryCodes = null)
    {
        var roles = await _userManager.GetRolesAsync(user);
        var token = _tokenService.CreateToken(user, roles);
        var refresh = RefreshTokenRules.CanHoldRefreshToken(user.MustChangePassword)
            ? await _refreshTokens.IssueFamilyAsync(user, roles.ToList())
            : null;
        return new LoginResponse(token.Token, token.ExpiresAtUtc, user.MustChangePassword, await ToUserInfo(user), refresh?.Token, refresh?.ExpiresAtUtc, recoveryCodes);
    }

    private ObjectResult InvalidCredentials() =>
        Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Kullanıcı adı veya şifre hatalı.");

    private ObjectResult IdentityProblem(IdentityResult result) =>
        Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "İşlem başarısız.",
            detail: string.Join(" ", result.Errors.Select(e => e.Description)));
}
