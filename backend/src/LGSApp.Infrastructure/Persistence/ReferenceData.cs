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
        ("Matematik", "Çarpanlar ve Katlar", 1),
        ("Matematik", "Üslü İfadeler", 2),
        ("Matematik", "Kareköklü İfadeler", 3),
        ("Matematik", "Veri Analizi", 4),
        ("Matematik", "Basit Olayların Olma Olasılığı", 5),
        ("Matematik", "Cebirsel İfadeler ve Özdeşlikler", 6),
        ("Matematik", "Doğrusal Denklemler", 7),
        ("Matematik", "Eşitsizlikler", 8),
        ("Matematik", "Üçgenler", 9),
        ("Matematik", "Eşlik ve Benzerlik", 10),
        ("Matematik", "Dönüşüm Geometrisi", 11),
        ("Matematik", "Geometrik Cisimler", 12),
        ("Fen Bilimleri", "Mevsimlerin Oluşumu", 1),
        ("Fen Bilimleri", "İklim ve Hava Hareketleri", 2),
        ("Fen Bilimleri", "DNA ve Genetik Kod", 3),
        ("Fen Bilimleri", "Kalıtım", 4),
        ("Fen Bilimleri", "Mutasyon ve Modifikasyon", 5),
        ("Fen Bilimleri", "Adaptasyon", 6),
        ("Fen Bilimleri", "Biyoteknoloji", 7),
        ("Fen Bilimleri", "Katı Basıncı", 8),
        ("Fen Bilimleri", "Sıvı Basıncı", 9),
        ("Fen Bilimleri", "Gaz Basıncı", 10),
        ("Fen Bilimleri", "Periyodik Sistem", 11),
        ("Fen Bilimleri", "Fiziksel ve Kimyasal Değişimler", 12),
        ("Fen Bilimleri", "Kimyasal Tepkimeler", 13),
        ("Fen Bilimleri", "Asitler ve Bazlar", 14),
        ("Fen Bilimleri", "Maddenin Isı ile Etkileşimi", 15),
        ("Fen Bilimleri", "Türkiye'de Kimya Endüstrisi", 16),
        ("Fen Bilimleri", "Basit Makineler", 17),
        ("Fen Bilimleri", "Besin Zinciri ve Enerji Akışı", 18),
        ("Fen Bilimleri", "Enerji Dönüşümleri", 19),
        ("Fen Bilimleri", "Madde Döngüleri ve Çevre Sorunları", 20),
        ("Fen Bilimleri", "Sürdürülebilir Kalkınma", 21),
        ("Fen Bilimleri", "Elektrik Yükleri ve Elektriklenme", 22),
        ("Fen Bilimleri", "Elektrik Yüklü Cisimler", 23),
        ("Fen Bilimleri", "Elektrik Enerjisinin Dönüşümü", 24),
        ("Türkçe", "Sözcükte Anlam", 1),
        ("Türkçe", "Deyimler ve Atasözleri", 2),
        ("Türkçe", "Söz Sanatları", 3),
        ("Türkçe", "Cümlede Anlam", 4),
        ("Türkçe", "Paragrafta Anlam", 5),
        ("Türkçe", "Metin Türleri", 6),
        ("Türkçe", "Görsel, Grafik ve Tablo Yorumlama", 7),
        ("Türkçe", "Sözel Mantık ve Muhakeme", 8),
        ("Türkçe", "Fiilimsiler", 9),
        ("Türkçe", "Cümlenin Ögeleri", 10),
        ("Türkçe", "Fiilde Çatı", 11),
        ("Türkçe", "Cümle Türleri", 12),
        ("Türkçe", "Yazım Kuralları", 13),
        ("Türkçe", "Noktalama İşaretleri", 14),
        ("Türkçe", "Anlatım Bozuklukları", 15),
        ("T.C. İnkılap Tarihi ve Atatürkçülük", "Bir Kahraman Doğuyor", 1),
        ("T.C. İnkılap Tarihi ve Atatürkçülük", "Millî Uyanış: Bağımsızlık Yolunda Atılan Adımlar", 2),
        ("T.C. İnkılap Tarihi ve Atatürkçülük", "Millî Bir Destan: Ya İstiklal Ya Ölüm!", 3),
        ("T.C. İnkılap Tarihi ve Atatürkçülük", "Atatürkçülük ve Çağdaşlaşan Türkiye", 4),
        ("T.C. İnkılap Tarihi ve Atatürkçülük", "Demokratikleşme Çabaları", 5),
        ("T.C. İnkılap Tarihi ve Atatürkçülük", "Atatürk Dönemi Türk Dış Politikası", 6),
        ("T.C. İnkılap Tarihi ve Atatürkçülük", "Atatürk'ün Ölümü ve Sonrası", 7),
        ("Din Kültürü ve Ahlak Bilgisi", "Kader İnancı", 1),
        ("Din Kültürü ve Ahlak Bilgisi", "Zekât ve Sadaka", 2),
        ("Din Kültürü ve Ahlak Bilgisi", "Din ve Hayat", 3),
        ("Din Kültürü ve Ahlak Bilgisi", "Hz. Muhammed'in Örnekliği", 4),
        ("Din Kültürü ve Ahlak Bilgisi", "Kur'an-ı Kerim ve Özellikleri", 5),
        ("İngilizce", "Friendship", 1),
        ("İngilizce", "Teen Life", 2),
        ("İngilizce", "In the Kitchen", 3),
        ("İngilizce", "On the Phone", 4),
        ("İngilizce", "The Internet", 5),
        ("İngilizce", "Adventures", 6),
        ("İngilizce", "Tourism", 7),
        ("İngilizce", "Chores", 8),
        ("İngilizce", "Science", 9),
        ("İngilizce", "Natural Forces", 10)
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
