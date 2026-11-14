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
    public AiLogStatus Status { get; set; } = AiLogStatus.Succeeded;
    public AiErrorKind ErrorKind { get; set; }
    public string? ErrorMessage { get; set; }
    public short? HttpStatus { get; set; }
    public byte AttemptCount { get; set; } = 1;
    public int? ThinkingTokens { get; set; }
    public decimal? CostUsd { get; set; }
    public bool CountsTowardLimit { get; set; }
    public int? SolutionId { get; set; }
    public int? ImageFileId { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? ModelVersion { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
