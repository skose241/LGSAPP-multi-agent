using System.ComponentModel.DataAnnotations;
using LGSApp.Infrastructure.Services.Common;

namespace LGSApp.Api.Dtos;

public record CreateUserRequest(
    [Required(ErrorMessage = "Kullanıcı adı zorunludur."), StringLength(100, ErrorMessage = "Kullanıcı adı en fazla {1} karakter olabilir.")] string UserName,
    [Required(ErrorMessage = "Ad zorunludur."), StringLength(100, ErrorMessage = "Ad en fazla {1} karakter olabilir.")] string FirstName,
    [Required(ErrorMessage = "Soyad zorunludur."), StringLength(100, ErrorMessage = "Soyad en fazla {1} karakter olabilir.")] string LastName,
    [Required(ErrorMessage = "Rol zorunludur.")] string Role,
    [StringLength(50, ErrorMessage = "Sınıf en fazla {1} karakter olabilir.")] string? ClassName,
    int? BranchLessonId = null);

public record UpdateBranchLessonRequest(int? BranchLessonId);

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
    int? CreatedByUserId,
    bool IsSystemAccount,
    int? BranchLessonId,
    string? BranchLessonName,
    DateTime? BannedAt,
    UserRefView? BannedBy,
    int PendingReportCount);

public record UpdateUserProfileRequest(
    [Required(ErrorMessage = "Ad zorunludur."), StringLength(100, ErrorMessage = "Ad en fazla {1} karakter olabilir.")] string FirstName,
    [Required(ErrorMessage = "Soyad zorunludur."), StringLength(100, ErrorMessage = "Soyad en fazla {1} karakter olabilir.")] string LastName,
    [StringLength(50, ErrorMessage = "Sınıf en fazla {1} karakter olabilir.")] string? ClassName);

public record BulkUserItemRequest(
    string? UserName,
    string? FirstName,
    string? LastName,
    string? Role,
    string? ClassName,
    int? BranchLessonId = null);

public record BulkCreateUsersRequest(List<BulkUserItemRequest?>? Items);

public record BulkCreatedUsersResponse(IReadOnlyList<CreatedUserResponse> Users);

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
