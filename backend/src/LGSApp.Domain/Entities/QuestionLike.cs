namespace LGSApp.Domain.Entities;

public class QuestionLike
{
    public int QuestionId { get; set; }
    public int UserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
