using System.ComponentModel.DataAnnotations;
using LGSApp.Infrastructure.Services.Scheduler;

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

public record RunDetailResponse(
    int Id,
    DateOnly RunDate,
    string Kind,
    string Trigger,
    RunUserView? TriggeredBy,
    string Status,
    DateTime StartedAt,
    DateTime? FinishedAt,
    DateTime LeaseUntil,
    int SucceededCount,
    int FailedCount,
    string? Summary,
    IReadOnlyList<RunLogView> Logs);
