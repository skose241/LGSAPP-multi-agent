using System.Globalization;
using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Persistence;

public sealed record ReferenceDataResult(
    IReadOnlyList<string> LessonsAdded,
    IReadOnlyList<(string Lesson, string Topic)> TopicsAdded,
    int LessonsExisting,
    int TopicsExisting);

public static class ReferenceData
{
    public static readonly IReadOnlyList<(string Name, LessonSession Session, int OrderNo)> Lessons =
    [
        ("Türkçe", LessonSession.Sozel, 1),
        ("T.C. İnkılap Tarihi ve Atatürkçülük", LessonSession.Sozel, 2),
        ("Din Kültürü ve Ahlak Bilgisi", LessonSession.Sozel, 3),
        ("İngilizce", LessonSession.Sozel, 4),
        ("Matematik", LessonSession.Sayisal, 5),
        ("Fen Bilimleri", LessonSession.Sayisal, 6)
    ];

    public static readonly IReadOnlyList<(string Lesson, string Topic, int OrderNo)> Topics =
    [
        ("Türkçe", "Sözcükte ve Söz Gruplarında Anlam", 1),
        ("Türkçe", "Fiilimsiler", 2),
        ("Türkçe", "Cümlenin Ögeleri", 3),
        ("Türkçe", "Deyimler ve Atasözleri", 4),
        ("Matematik", "Çarpanlar ve Katlar", 1),
        ("Matematik", "Üslü İfadeler", 2),
        ("Matematik", "Kareköklü İfadeler", 3),
        ("Fen Bilimleri", "Mevsimler ve İklim", 1),
        ("Fen Bilimleri", "DNA ve Genetik Kod", 2),
        ("T.C. İnkılap Tarihi ve Atatürkçülük", "Bir Kahraman Doğuyor", 1),
        ("T.C. İnkılap Tarihi ve Atatürkçülük", "Milli Uyanış", 2),
        ("İngilizce", "Friendship", 1),
        ("İngilizce", "Teen Life", 2),
        ("Din Kültürü ve Ahlak Bilgisi", "Kader İnancı", 1),
        ("Din Kültürü ve Ahlak Bilgisi", "Zekat ve Sadaka", 2)
    ];

    private static readonly CultureInfo Turkish = new("tr-TR");

    private static string Normalize(string value) => value.Trim().ToUpper(Turkish);

    public static Task<ReferenceDataResult> ApplyAsync(AppDbContext db, bool dryRun, CancellationToken cancellationToken = default) =>
        db.Database.CreateExecutionStrategy().ExecuteAsync(ct => ApplyInTransactionAsync(db, dryRun, ct), cancellationToken);

    private static async Task<ReferenceDataResult> ApplyInTransactionAsync(AppDbContext db, bool dryRun, CancellationToken cancellationToken)
    {
        db.ChangeTracker.Clear();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var lessons = new Dictionary<string, Lesson>();
        foreach (var existing in await db.Lessons.ToListAsync(cancellationToken))
        {
            lessons.TryAdd(Normalize(existing.Name), existing);
        }

        var lessonsAdded = new List<string>();
        var lessonsExisting = 0;
        foreach (var (name, session, orderNo) in Lessons)
        {
            var key = Normalize(name);
            if (lessons.ContainsKey(key))
            {
                lessonsExisting++;
                continue;
            }

            lessonsAdded.Add(name);
            if (!dryRun)
            {
                var lesson = new Lesson { Name = name, Session = session, OrderNo = orderNo, IsActive = true };
                db.Lessons.Add(lesson);
                lessons[key] = lesson;
            }
        }

        if (!dryRun && lessonsAdded.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        var existingTopics = (await db.Topics
                .Select(t => new { LessonName = t.Lesson.Name, t.Name })
                .ToListAsync(cancellationToken))
            .Select(t => (Normalize(t.LessonName), Normalize(t.Name)))
            .ToHashSet();

        var topicsAdded = new List<(string Lesson, string Topic)>();
        var topicsExisting = 0;
        foreach (var (lessonName, topicName, orderNo) in Topics)
        {
            var lessonKey = Normalize(lessonName);
            if (existingTopics.Contains((lessonKey, Normalize(topicName))))
            {
                topicsExisting++;
                continue;
            }

            topicsAdded.Add((lessonName, topicName));
            if (!dryRun)
            {
                db.Topics.Add(new Topic { LessonId = lessons[lessonKey].Id, Name = topicName, OrderNo = orderNo, IsActive = true });
            }
        }

        if (!dryRun && topicsAdded.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return new ReferenceDataResult(lessonsAdded, topicsAdded, lessonsExisting, topicsExisting);
    }
}
