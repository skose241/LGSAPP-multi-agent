namespace LGSApp.Domain.Entities;

public class PointTransaction
{
    public long Id { get; set; }
    public int UserId { get; set; }
    public int Amount { get; set; }
    public PointReason Reason { get; set; }
    public int? QuestionId { get; set; }
    public int? AnswerId { get; set; }
    public int? AssignmentId { get; set; }
    public DateOnly LocalDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedByUserId { get; set; }
}
