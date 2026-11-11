namespace LGSApp.Domain.Entities;

public class Report
{
    public int Id { get; set; }
    public ReportTargetType TargetType { get; set; }
    public int QuestionId { get; set; }
    public int? CommentId { get; set; }
    public int? SolutionId { get; set; }
    public int ReportedUserId { get; set; }
    public int ReporterUserId { get; set; }
    public ReportReason Reason { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? TargetSnapshot { get; set; }
    public ReportStatus Status { get; set; } = ReportStatus.Pending;
    public ReportAction ActionTaken { get; set; } = ReportAction.None;
    public int? ResolvedByUserId { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public string? ResolutionNote { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}
