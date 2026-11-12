using System.ComponentModel.DataAnnotations;

namespace LGSApp.Api.Dtos;

public record CreateAssignmentRequest(
    [Range(1, int.MaxValue, ErrorMessage = "Ders seçimi zorunludur.")] int LessonId,
    [StringLength(1000, ErrorMessage = "Başlık çok uzun.")] string? Title,
    [StringLength(10000, ErrorMessage = "Açıklama çok uzun.")] string? Description,
    DateOnly StartDate,
    DateOnly EndDate);

public record UpdateAssignmentRequest(
    [StringLength(1000, ErrorMessage = "Başlık çok uzun.")] string? Title,
    [StringLength(10000, ErrorMessage = "Açıklama çok uzun.")] string? Description,
    DateOnly? StartDate,
    DateOnly? EndDate,
    [Required(ErrorMessage = "Sürüm bilgisi zorunludur.")] byte[] RowVersion);

public record AssignmentRowVersionRequest(
    [Required(ErrorMessage = "Sürüm bilgisi zorunludur.")] byte[] RowVersion);

public record AssignmentQuestionItemRequest(
    string? Text,
    int? ImageFileId,
    string? OptionA,
    string? OptionB,
    string? OptionC,
    string? OptionD,
    byte? CorrectOption,
    int? TopicId,
    string? Description);

public record AddAssignmentQuestionsRequest(
    [Required(ErrorMessage = "Soru listesi zorunludur.")] List<AssignmentQuestionItemRequest> Items);

public record AssignmentQuestionIdsRequest(
    [Required(ErrorMessage = "Soru listesi zorunludur.")] List<int> QuestionIds);

public record UpdateAssignmentQuestionRequest(
    string? Text,
    int? ImageFileId,
    string? OptionA,
    string? OptionB,
    string? OptionC,
    string? OptionD,
    byte? CorrectOption,
    int? TopicId,
    string? Description,
    [Required(ErrorMessage = "Sürüm bilgisi zorunludur.")] byte[] RowVersion);
