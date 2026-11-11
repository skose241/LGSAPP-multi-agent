namespace LGSApp.Domain.Entities;

public class Notification
{
    public long Id { get; set; }
    public int UserId { get; set; }
    public NotificationType Type { get; set; }
    public string Message { get; set; } = string.Empty;
    public int? QuestionId { get; set; }
    public int? AssignmentId { get; set; }
    public int? CommentId { get; set; }
    public Comment? Comment { get; set; }
    public int? RunId { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
