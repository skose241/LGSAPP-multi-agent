using System.ComponentModel.DataAnnotations;

namespace LGSApp.Api.Dtos;

public record CreateUserRequest(
    [Required, StringLength(100)] string UserName,
    [Required, StringLength(100)] string FirstName,
    [Required, StringLength(100)] string LastName,
    [Required] string Role,
    [StringLength(50)] string? ClassName);

public record AdminUserDto(
    int Id,
    string UserName,
    string FirstName,
    string LastName,
    string? ClassName,
    string? Role,
    bool IsBanned,
    bool MustChangePassword,
    DateTime CreatedAt,
    DateTime? LastLoginAt,
    int? CreatedByUserId);

public record CreatedUserResponse(AdminUserDto User, string OneTimePassword);

public record OneTimePasswordResponse(int UserId, string OneTimePassword, bool MustChangePassword);

public record PasswordResetRequestDto(
    int Id,
    int UserId,
    string UserName,
    string FirstName,
    string LastName,
    string? ClassName,
    DateTime CreatedAt);
