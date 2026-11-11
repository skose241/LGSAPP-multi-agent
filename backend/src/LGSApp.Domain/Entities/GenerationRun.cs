namespace LGSApp.Domain.Entities;

public class GenerationRun
{
    public int Id { get; set; }
    public DateOnly RunDate { get; set; }
    public GenerationKind Kind { get; set; }
    public GenerationTrigger Trigger { get; set; }
    public int? TriggeredByUserId { get; set; }
    public GenerationRunStatus Status { get; set; } = GenerationRunStatus.Running;
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? FinishedAt { get; set; }
    public DateTime LeaseUntil { get; set; }
    public int SucceededCount { get; set; }
    public int FailedCount { get; set; }
    public string? Summary { get; set; }
    public byte[] RowVersion { get; set; } = [];
}
