namespace LGSApp.Domain.Entities;

public class AssignmentQuestion
{
    public int AssignmentId { get; set; }
    public int QuestionId { get; set; }
    public int OrderNo { get; set; }
    public bool CreatedForAssignment { get; set; }
}
