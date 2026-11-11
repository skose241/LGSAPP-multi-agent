namespace LGSApp.Domain.Entities;

public class DailyTopicPlan
{
    public int Id { get; set; }
    public DateOnly PlanDate { get; set; }
    public int LessonId { get; set; }
    public int TopicId { get; set; }
    public int PlannedByUserId { get; set; }
    public byte? TargetCount { get; set; }
    public DateTime? UsedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}
