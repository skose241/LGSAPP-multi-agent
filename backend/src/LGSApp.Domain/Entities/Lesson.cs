namespace LGSApp.Domain.Entities;

public class Lesson
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public LessonSession Session { get; set; }
    public int OrderNo { get; set; }
    public bool IsActive { get; set; } = true;
    public List<Topic> Topics { get; set; } = [];
}
