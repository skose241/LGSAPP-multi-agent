using System.Security.Claims;
using System.Text;
using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ITokenService _tokenService;
    private readonly IAppEmailSender _emailSender;
    private readonly IConfiguration _configuration;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        ITokenService tokenService,
        IAppEmailSender emailSender,
        IConfiguration configuration)
    {
        _userManager = userManager;
        _tokenService = tokenService;
        _emailSender = emailSender;
        _configuration = configuration;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request)
    {
        var user = await _userManager.FindByNameAsync(request.UserName);
        if (user is null)
        {
            return InvalidCredentials();
        }

        if (user.IsBanned)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Hesap engellenmis.");
        }

        if (await _userManager.IsLockedOutAsync(user))
        {
            return Problem(statusCode: StatusCodes.Status423Locked, title: "Hesap gecici olarak kilitlendi. Daha sonra tekrar deneyin.");
        }

        if (!await _userManager.CheckPasswordAsync(user, request.Password))
        {
            await _userManager.AccessFailedAsync(user);
            return InvalidCredentials();
        }

        await _userManager.ResetAccessFailedCountAsync(user);
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
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Yeni sifre mevcut sifreden farkli olmali.");
        }

        var result = await _userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            return IdentityProblem(result);
        }

        user.MustChangePassword = false;
        var update = await _userManager.UpdateAsync(user);
        if (!update.Succeeded)
        {
            return IdentityProblem(update);
        }

        return Ok(await BuildLoginResponse(user));
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is not null && !user.IsBanned)
        {
            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var encoded = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
            var baseUrl = _configuration["Frontend:ResetPasswordUrl"] ?? "http://localhost:3000/reset-password";
            var link = $"{baseUrl}?email={Uri.EscapeDataString(request.Email)}&token={encoded}";
            await _emailSender.SendAsync(request.Email, "Sifre sifirlama", $"Sifrenizi sifirlamak icin baglanti: {link}");
        }

        return Ok(new { message = "E-posta kayitliysa sifirlama baglantisi gonderildi." });
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null || user.IsBanned)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Gecersiz veya suresi dolmus sifirlama istegi.");
        }

        string token;
        try
        {
            token = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(request.Token));
        }
        catch (FormatException)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Gecersiz veya suresi dolmus sifirlama istegi.");
        }

        var result = await _userManager.ResetPasswordAsync(user, token, request.NewPassword);
        if (!result.Succeeded)
        {
            return IdentityProblem(result);
        }

        user.MustChangePassword = false;
        await _userManager.UpdateAsync(user);
        await _userManager.ResetAccessFailedCountAsync(user);

        return Ok(new { message = "Sifre guncellendi." });
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
            user.Email,
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
        Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Kullanici adi veya sifre hatali.");

    private ObjectResult IdentityProblem(IdentityResult result) =>
        Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Islem basarisiz.",
            detail: string.Join(" ", result.Errors.Select(e => e.Description)));
}
