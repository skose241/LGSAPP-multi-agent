namespace LGSApp.Domain.Entities;

public class AiLog
{
    public long Id { get; set; }
    public int? UserId { get; set; }
    public int? QuestionId { get; set; }
    public AiOperation Operation { get; set; }
    public string? Model { get; set; }
    public string? Input { get; set; }
    public string? Output { get; set; }
    public int? InputTokens { get; set; }
    public int? OutputTokens { get; set; }
    public int? DurationMs { get; set; }
    public bool Success { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
