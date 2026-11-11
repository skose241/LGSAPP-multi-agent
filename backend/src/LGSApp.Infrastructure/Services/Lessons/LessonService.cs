using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Lessons;

public sealed record TopicView(int Id, int LessonId, string Name, int OrderNo);

public sealed record LessonView(int Id, string Name, LessonSession Session, int OrderNo, IReadOnlyList<TopicView> Topics);

public interface ILessonService
{
    Task<IReadOnlyList<LessonView>> GetLessonsAsync(CancellationToken cancellationToken = default);
    Task<ServiceResult<IReadOnlyList<TopicView>>> GetTopicsAsync(int lessonId, CancellationToken cancellationToken = default);
}

public sealed class LessonService(AppDbContext db) : ILessonService
{
    public async Task<IReadOnlyList<LessonView>> GetLessonsAsync(CancellationToken cancellationToken = default)
    {
        var lessons = await db.Lessons.AsNoTracking()
            .Where(l => l.IsActive)
            .OrderBy(l => l.OrderNo).ThenBy(l => l.Id)
            .Select(l => new { l.Id, l.Name, l.Session, l.OrderNo })
            .ToListAsync(cancellationToken);

        var topics = await db.Topics.AsNoTracking()
            .Where(t => t.IsActive && t.Lesson.IsActive)
            .OrderBy(t => t.OrderNo).ThenBy(t => t.Id)
            .Select(t => new TopicView(t.Id, t.LessonId, t.Name, t.OrderNo))
            .ToListAsync(cancellationToken);

        var byLesson = topics.ToLookup(t => t.LessonId);
        return lessons
            .Select(l => new LessonView(l.Id, l.Name, l.Session, l.OrderNo, byLesson[l.Id].ToList()))
            .ToList();
    }

    public async Task<ServiceResult<IReadOnlyList<TopicView>>> GetTopicsAsync(int lessonId, CancellationToken cancellationToken = default)
    {
        var exists = await db.Lessons.AsNoTracking().AnyAsync(l => l.Id == lessonId && l.IsActive, cancellationToken);
        if (!exists)
        {
            return Fail.NotFound("Ders bulunamadı.");
        }

        var topics = await db.Topics.AsNoTracking()
            .Where(t => t.LessonId == lessonId && t.IsActive)
            .OrderBy(t => t.OrderNo).ThenBy(t => t.Id)
            .Select(t => new TopicView(t.Id, t.LessonId, t.Name, t.OrderNo))
            .ToListAsync(cancellationToken);

        return ServiceResult<IReadOnlyList<TopicView>>.Ok(topics);
    }
}
