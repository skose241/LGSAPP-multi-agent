using System.ComponentModel.DataAnnotations;

namespace LGSApp.Api.Dtos;

public record LoginRequest(
    [Required(ErrorMessage = "Kullanıcı adı zorunludur."), StringLength(100, ErrorMessage = "Kullanıcı adı en fazla {1} karakter olabilir.")] string UserName,
    [Required(ErrorMessage = "Şifre zorunludur."), StringLength(128, ErrorMessage = "Şifre en fazla {1} karakter olabilir.")] string Password);

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
    [Required(ErrorMessage = "Mevcut şifre zorunludur."), StringLength(128, ErrorMessage = "Mevcut şifre en fazla {1} karakter olabilir.")] string CurrentPassword,
    [Required(ErrorMessage = "Yeni şifre zorunludur."), StringLength(128, ErrorMessage = "Yeni şifre en fazla {1} karakter olabilir.")] string NewPassword);

public record ForgotPasswordRequest(
    [Required(ErrorMessage = "Kullanıcı adı zorunludur."), StringLength(100, ErrorMessage = "Kullanıcı adı en fazla {1} karakter olabilir.")] string UserName);
