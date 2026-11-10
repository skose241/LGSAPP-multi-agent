using System.ComponentModel.DataAnnotations;

namespace LGSApp.Api.Dtos;

public record LoginRequest(
    [Required] string UserName,
    [Required] string Password);

public record UserInfoDto(
    int Id,
    string UserName,
    string FirstName,
    string LastName,
    string? Email,
    string? ClassName,
    string Role,
    bool MustChangePassword);

public record LoginResponse(
    string Token,
    DateTime ExpiresAtUtc,
    bool MustChangePassword,
    UserInfoDto User);

public record ChangePasswordRequest(
    [Required] string CurrentPassword,
    [Required] string NewPassword);

public record ForgotPasswordRequest(
    [Required, EmailAddress] string Email);

public record ResetPasswordRequest(
    [Required, EmailAddress] string Email,
    [Required] string Token,
    [Required] string NewPassword);
