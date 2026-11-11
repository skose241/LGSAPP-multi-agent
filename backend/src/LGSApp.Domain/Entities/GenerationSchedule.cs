namespace LGSApp.Domain.Entities;

public class GenerationSchedule
{
    public byte DayOfWeek { get; set; }
    public int LessonId { get; set; }
    public byte QuestionCount { get; set; }
}
