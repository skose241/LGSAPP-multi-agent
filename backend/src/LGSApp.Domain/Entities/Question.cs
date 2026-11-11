namespace LGSApp.Domain.Entities;

public class Question
{
    public int Id { get; set; }
    public int AuthorUserId { get; set; }
    public ApplicationUser Author { get; set; } = null!;
    public int LessonId { get; set; }
    public Lesson Lesson { get; set; } = null!;
    public int? TopicId { get; set; }
    public QuestionSource Source { get; set; }
    public string? Text { get; set; }
    public int? ImageFileId { get; set; }
    public string? OptionA { get; set; }
    public string? OptionB { get; set; }
    public string? OptionC { get; set; }
    public string? OptionD { get; set; }
    public byte CorrectOption { get; set; }
    public string? Description { get; set; }
    public DateOnly? ScheduledPublishDate { get; set; }
    public DateTime? PublishedAt { get; set; }
    public bool IsHidden { get; set; }
    public DateTime? HiddenAt { get; set; }
    public int? HiddenByUserId { get; set; }
    public bool IsAnswerDisputed { get; set; }
    public DateTime? AnswerDisputedAt { get; set; }
    public byte? AiSuggestedOption { get; set; }
    public bool SolutionNotNeeded { get; set; }
    public DateTime? CorrectOptionChangedAt { get; set; }
    public int? CorrectOptionChangedByUserId { get; set; }
    public DateOnly? GenerationDate { get; set; }
    public byte? GenerationSlot { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}
