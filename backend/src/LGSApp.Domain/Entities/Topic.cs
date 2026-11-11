namespace LGSApp.Domain.Entities;

public class Topic
{
    public int Id { get; set; }
    public int LessonId { get; set; }
    public Lesson Lesson { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public int OrderNo { get; set; }
    public bool IsActive { get; set; } = true;
}
