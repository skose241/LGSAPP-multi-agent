using System.ComponentModel.DataAnnotations;

namespace LGSApp.Api.Dtos;

public record StartSchedulerRunRequest(
    [Required(ErrorMessage = "Görev türü zorunludur.")] string? Kind);

public record SaveTopicPlanRequest(
    [Range(1, int.MaxValue, ErrorMessage = "Konu seçimi zorunludur.")] int TopicId,
    int? TargetCount,
    byte[]? RowVersion);

public record ScheduleItemRequest(
    int IsoDayOfWeek,
    int LessonId,
    int QuestionCount);

public record ReplaceGenerationScheduleRequest(
    [Required(ErrorMessage = "Program kalemleri zorunludur.")] List<ScheduleItemRequest>? Items);
