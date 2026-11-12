using System.ComponentModel.DataAnnotations;

namespace LGSApp.Api.Dtos;

public record SubmitAnswerRequest(
    [Range(1, 4, ErrorMessage = "Seçenek 1 ile 4 arasında olmalıdır.")] byte SelectedOption,
    [NoControlChars, StringLength(20000, ErrorMessage = "Çözüm açıklaması çok uzun.")] string? SolutionText,
    int? SolutionImageFileId);

public record CreateTeacherSolutionRequest(
    [NoControlChars, StringLength(20000, ErrorMessage = "Çözüm metni çok uzun.")] string? Text,
    int? ImageFileId);

public record UpdateSolutionRequest(
    [NoControlChars, StringLength(20000, ErrorMessage = "Çözüm metni çok uzun.")] string? Text,
    int? ImageFileId,
    [Required(ErrorMessage = "Sürüm bilgisi zorunludur.")] byte[] RowVersion);

public record ChangeCorrectOptionRequest(
    [Range(1, 4, ErrorMessage = "Doğru şık 1 ile 4 arasında olmalıdır.")] byte CorrectOption,
    [Required(ErrorMessage = "Sürüm bilgisi zorunludur.")] byte[] RowVersion,
    [NoControlChars, StringLength(500, ErrorMessage = "Not en fazla {1} karakter olabilir.")] string? Note);
