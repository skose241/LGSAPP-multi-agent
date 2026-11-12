using System.Diagnostics;
using System.Security.Claims;
using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Api.Options;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class RecoveryController : ControllerBase
{
    private const string RecoverFailureMessage = "Kullanıcı adı veya kurtarma kodu hatalı.";
    private const string RecoverSuccessMessage = "Şifreniz yenilendi. Yeni şifrenizle giriş yapabilirsiniz.";

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly AppDbContext _db;
    private readonly RecoveryCodeService _codes;
    private readonly MudurRecoveryService _recovery;
    private readonly ResponseTimingOptions _timing;

    public RecoveryController(
        UserManager<ApplicationUser> userManager,
        AppDbContext db,
        RecoveryCodeService codes,
        MudurRecoveryService recovery,
        IOptions<ResponseTimingOptions> timing)
    {
        _userManager = userManager;
        _db = db;
        _codes = codes;
        _recovery = recovery;
        _timing = timing.Value;
    }

    [HttpPost("recover")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitingExtensions.RecoverPolicy)]
    public async Task<IActionResult> Recover(RecoverRequest request, CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();

        var policy = await _recovery.ValidateNewPasswordAsync(request.NewPassword);
        if (policy is not null)
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "İşlem başarısız.",
                detail: string.Join(" ", policy.Errors.Select(e => e.Description)));
        }

        var outcome = await _recovery.RecoverAsync(request.UserName, request.RecoveryCode, request.NewPassword, cancellationToken);
        await ResponseTimer.WaitForMinimumAsync(started, _timing.RecoverMinMilliseconds, cancellationToken);

        if (outcome.Succeeded)
        {
            return Ok(new RecoverResponse(RecoverSuccessMessage, outcome.RemainingCodes));
        }

        return Problem(statusCode: StatusCodes.Status400BadRequest, title: RecoverFailureMessage);
    }

    [HttpGet("recovery-codes/status")]
    [Authorize(Policy = Policies.MudurOnly)]
    public async Task<ActionResult<RecoveryStatusResponse>> Status(CancellationToken cancellationToken)
    {
        var userId = CurrentUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return Ok(new RecoveryStatusResponse(await _codes.RemainingAsync(userId.Value, cancellationToken)));
    }

    [HttpPost("recovery-codes/regenerate")]
    [Authorize(Policy = Policies.MudurOnly)]
    public async Task<ActionResult<RecoveryCodesResponse>> Regenerate(RegenerateRecoveryCodesRequest request, CancellationToken cancellationToken)
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = id is null ? null : await _userManager.FindByIdAsync(id);
        if (user is null)
        {
            return Unauthorized();
        }

        if (user.MustChangePassword)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Önce şifrenizi değiştirmelisiniz.");
        }

        if (await _userManager.IsLockedOutAsync(user))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Hesap geçici olarak kilitlendi. Daha sonra tekrar deneyin.");
        }

        if (!await _userManager.CheckPasswordAsync(user, request.CurrentPassword))
        {
            await _userManager.AccessFailedAsync(user);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Mevcut şifre hatalı.");
        }

        await _userManager.ResetAccessFailedCountAsync(user);

        IReadOnlyList<string> codes = [];
        var userId = user.Id;
        var strategy = _db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            _db.ChangeTracker.Clear();
            await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
            codes = await _codes.IssueAsync(userId, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        });

        return Ok(new RecoveryCodesResponse(codes));
    }

    private int? CurrentUserId() =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out var id) ? id : null;
}
