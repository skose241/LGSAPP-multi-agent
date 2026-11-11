using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Persistence;

public static class DbSeeder
{
    private static readonly (string Name, LessonSession Session, int OrderNo)[] ReferenceLessons =
    [
        ("Türkçe", LessonSession.Sozel, 1),
        ("T.C. İnkılap Tarihi ve Atatürkçülük", LessonSession.Sozel, 2),
        ("Din Kültürü ve Ahlak Bilgisi", LessonSession.Sozel, 3),
        ("İngilizce", LessonSession.Sozel, 4),
        ("Matematik", LessonSession.Sayisal, 5),
        ("Fen Bilimleri", LessonSession.Sayisal, 6)
    ];

    private static readonly (string Lesson, string Topic, int OrderNo)[] ReferenceTopics =
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

    public static async Task SeedReferenceDataAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        using var scope = services.CreateScope();
        var environment = scope.ServiceProvider.GetRequiredService<IHostEnvironment>();
        if (!environment.IsDevelopment())
        {
            return;
        }

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbSeeder");

        var lessons = await db.Lessons.ToDictionaryAsync(l => l.Name, cancellationToken);
        foreach (var (name, session, orderNo) in ReferenceLessons)
        {
            if (lessons.ContainsKey(name))
            {
                continue;
            }

            var lesson = new Lesson { Name = name, Session = session, OrderNo = orderNo, IsActive = true };
            db.Lessons.Add(lesson);
            lessons[name] = lesson;
        }

        await db.SaveChangesAsync(cancellationToken);

        var existing = (await db.Topics.Select(t => new { t.LessonId, t.Name }).ToListAsync(cancellationToken))
            .Select(t => (t.LessonId, t.Name))
            .ToHashSet();

        var added = 0;
        foreach (var (lessonName, topicName, orderNo) in ReferenceTopics)
        {
            var lessonId = lessons[lessonName].Id;
            if (existing.Contains((lessonId, topicName)))
            {
                continue;
            }

            db.Topics.Add(new Topic { LessonId = lessonId, Name = topicName, OrderNo = orderNo, IsActive = true });
            added++;
        }

        if (added > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Geliştirme ortamı için {Count} örnek konu eklendi.", added);
        }
    }

    public static async Task SeedAdminAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var options = scope.ServiceProvider.GetRequiredService<IOptions<SeedOptions>>().Value;
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbSeeder");

        if (!options.Enabled)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(options.AdminUserName) || string.IsNullOrWhiteSpace(options.AdminPassword))
        {
            logger.LogInformation("Seed:AdminUserName veya Seed:AdminPassword tanımlı değil, müdür hesabı oluşturulmadı.");
            return;
        }

        var userName = options.AdminUserName.Trim();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        if (await userManager.FindByNameAsync(userName) is not null)
        {
            return;
        }

        var admin = new ApplicationUser
        {
            UserName = userName,
            FirstName = options.AdminFirstName,
            LastName = options.AdminLastName,
            MustChangePassword = false,
            CreatedAt = DateTime.UtcNow
        };

        var created = await userManager.CreateAsync(admin, options.AdminPassword);
        if (!created.Succeeded)
        {
            logger.LogError("Müdür hesabı oluşturulamadı: {Errors}", string.Join("; ", created.Errors.Select(e => e.Description)));
            return;
        }

        var roleResult = await userManager.AddToRoleAsync(admin, Roles.Mudur);
        if (!roleResult.Succeeded)
        {
            logger.LogError("Müdür rolü atanamadı, hesap geri alınıyor: {Errors}", string.Join("; ", roleResult.Errors.Select(e => e.Description)));
            await userManager.DeleteAsync(admin);
            return;
        }

        logger.LogInformation("İlk müdür hesabı oluşturuldu: {UserName}", userName);
    }
}
