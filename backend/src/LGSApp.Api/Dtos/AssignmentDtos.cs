using System.ComponentModel.DataAnnotations;

namespace LGSApp.Api.Dtos;

public record CreateAssignmentRequest(
    [Range(1, int.MaxValue, ErrorMessage = "Ders seçimi zorunludur.")] int LessonId,
    [NoControlChars, StringLength(1000, ErrorMessage = "Başlık çok uzun.")] string? Title,
    [NoControlChars, StringLength(10000, ErrorMessage = "Açıklama çok uzun.")] string? Description,
    DateOnly StartDate,
    DateOnly EndDate);

public record UpdateAssignmentRequest(
    [NoControlChars, StringLength(1000, ErrorMessage = "Başlık çok uzun.")] string? Title,
    [NoControlChars, StringLength(10000, ErrorMessage = "Açıklama çok uzun.")] string? Description,
    DateOnly? StartDate,
    DateOnly? EndDate,
    [Required(ErrorMessage = "Sürüm bilgisi zorunludur.")] byte[] RowVersion);

public record AssignmentRowVersionRequest(
    [Required(ErrorMessage = "Sürüm bilgisi zorunludur.")] byte[] RowVersion);

public record AssignmentQuestionItemRequest(
    [NoControlChars] string? Text,
    int? ImageFileId,
    [NoControlChars] string? OptionA,
    [NoControlChars] string? OptionB,
    [NoControlChars] string? OptionC,
    [NoControlChars] string? OptionD,
    byte? CorrectOption,
    int? TopicId,
    [NoControlChars] string? Description);

public record AddAssignmentQuestionsRequest(
    [Required(ErrorMessage = "Soru listesi zorunludur.")] List<AssignmentQuestionItemRequest> Items);

public record AssignmentQuestionIdsRequest(
    [Required(ErrorMessage = "Soru listesi zorunludur.")] List<int> QuestionIds);

public record UpdateAssignmentQuestionRequest(
    [NoControlChars] string? Text,
    int? ImageFileId,
    [NoControlChars] string? OptionA,
    [NoControlChars] string? OptionB,
    [NoControlChars] string? OptionC,
    [NoControlChars] string? OptionD,
    byte? CorrectOption,
    int? TopicId,
    [NoControlChars] string? Description,
    [Required(ErrorMessage = "Sürüm bilgisi zorunludur.")] byte[] RowVersion);
