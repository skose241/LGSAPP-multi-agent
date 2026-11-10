using System.ComponentModel.DataAnnotations;

namespace LGSApp.Api.Dtos;

public record LoginRequest(
    [Required, StringLength(100)] string UserName,
    [Required, StringLength(128)] string Password);

public record UserInfoDto(
    int Id,
    string UserName,
    string FirstName,
    string LastName,
    string? ClassName,
    string Role,
    bool MustChangePassword);

public record LoginResponse(
    string Token,
    DateTime ExpiresAtUtc,
    bool MustChangePassword,
    UserInfoDto User);

public record ChangePasswordRequest(
    [Required, StringLength(128)] string CurrentPassword,
    [Required, StringLength(128)] string NewPassword);

public record ForgotPasswordRequest(
    [Required, StringLength(100)] string UserName);
