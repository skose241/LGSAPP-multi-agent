namespace LGSApp.Domain.Entities;

public class Solution
{
    public int Id { get; set; }
    public int QuestionId { get; set; }
    public int AuthorUserId { get; set; }
    public ApplicationUser Author { get; set; } = null!;
    public SolutionType Type { get; set; }
    public int? AnswerId { get; set; }
    public string? Text { get; set; }
    public int? ImageFileId { get; set; }
    public bool IsDeleted { get; set; }
    public bool IsHidden { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}
