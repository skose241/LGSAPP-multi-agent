namespace LGSApp.Domain.Entities;

public class GenerationLog
{
    public int Id { get; set; }
    public int RunId { get; set; }
    public DateOnly RunDate { get; set; }
    public int LessonId { get; set; }
    public int? TopicId { get; set; }
    public byte Slot { get; set; }
    public int AttemptNo { get; set; }
    public GenerationLogStatus Status { get; set; }
    public string? ErrorMessage { get; set; }
    public int? QuestionId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
