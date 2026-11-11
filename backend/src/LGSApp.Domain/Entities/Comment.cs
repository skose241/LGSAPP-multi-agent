namespace LGSApp.Domain.Entities;

public class Comment
{
    public int Id { get; set; }
    public int QuestionId { get; set; }
    public int? SolutionId { get; set; }
    public int? ParentId { get; set; }
    public int? RootId { get; set; }
    public byte Depth { get; set; }
    public int AuthorUserId { get; set; }
    public ApplicationUser Author { get; set; } = null!;
    public int? ReplyToUserId { get; set; }
    public string Body { get; set; } = string.Empty;
    public string BodyFingerprint { get; set; } = string.Empty;
    public CommentStatus Status { get; set; } = CommentStatus.Active;
    public string? ModerationReason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
    public byte EditCount { get; set; }
    public DateTime? DeletedAt { get; set; }
    public int? DeletedByUserId { get; set; }
    public byte[] RowVersion { get; set; } = [];
}
