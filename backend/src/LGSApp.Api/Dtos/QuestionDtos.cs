using System.ComponentModel.DataAnnotations;

namespace LGSApp.Api.Dtos;

public record SubmitAnswerRequest(
    [Range(1, 4, ErrorMessage = "Seçenek 1 ile 4 arasında olmalıdır.")] byte SelectedOption,
    [StringLength(20000, ErrorMessage = "Çözüm açıklaması çok uzun.")] string? SolutionText,
    int? SolutionImageFileId);

public record CreateTeacherSolutionRequest(
    [StringLength(20000, ErrorMessage = "Çözüm metni çok uzun.")] string? Text,
    int? ImageFileId);

public record UpdateSolutionRequest(
    [StringLength(20000, ErrorMessage = "Çözüm metni çok uzun.")] string? Text,
    int? ImageFileId,
    [Required(ErrorMessage = "Sürüm bilgisi zorunludur.")] byte[] RowVersion);
