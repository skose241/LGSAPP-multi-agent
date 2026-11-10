using System.ComponentModel.DataAnnotations;

namespace LGSApp.Api.Dtos;

public record CreateUserRequest(
    [Required, StringLength(256, MinimumLength = 3)] string UserName,
    [Required, StringLength(100)] string FirstName,
    [Required, StringLength(100)] string LastName,
    [Required] string Role,
    [EmailAddress] string? Email,
    [StringLength(50)] string? ClassName);

public record AdminUserDto(
    int Id,
    string UserName,
    string FirstName,
    string LastName,
    string? Email,
    string? ClassName,
    string? Role,
    bool IsBanned,
    bool MustChangePassword,
    DateTime CreatedAt,
    int? CreatedByUserId);

public record CreatedUserResponse(AdminUserDto User, string OneTimePassword);

public record OneTimePasswordResponse(int UserId, string OneTimePassword, bool MustChangePassword);
