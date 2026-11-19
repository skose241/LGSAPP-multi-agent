using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using System.Data;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Persistence;

public static class DbSeeder
{
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
        var result = await ReferenceData.ApplyAsync(db, false, cancellationToken);
        if (result.TopicsAdded.Count > 0)
        {
            logger.LogInformation("Geliştirme ortamı için {Count} örnek konu eklendi.", result.TopicsAdded.Count);
        }

        if (!await db.GenerationSchedules.AnyAsync(cancellationToken))
        {
            var activeLessonIds = await db.Lessons.Where(l => l.IsActive).Select(l => l.Id).ToListAsync(cancellationToken);
            foreach (var lessonId in activeLessonIds)
            {
                for (byte day = 1; day <= 5; day++)
                {
                    db.GenerationSchedules.Add(new GenerationSchedule { DayOfWeek = day, LessonId = lessonId, QuestionCount = 1 });
                }
            }

            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Geliştirme ortamı için örnek ders programı eklendi.");
        }
    }

    public static async Task RunExclusiveAsync(IServiceProvider services, string resource, Func<Task> step, CancellationToken cancellationToken = default)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.OpenConnectionAsync(cancellationToken);
        try
        {
            var result = new SqlParameter("@result", SqlDbType.Int) { Direction = ParameterDirection.Output };
            await db.Database.ExecuteSqlRawAsync(
                "EXEC @result = sp_getapplock @Resource = @resource, @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 120000",
                [result, new SqlParameter("@resource", resource)],
                cancellationToken);
            if (result.Value is not int code || code < 0)
            {
                throw new InvalidOperationException($"Başlangıç kilidi alınamadı ({resource}); başka bir örnek hâlâ başlangıç adımlarını yürütüyor olabilir.");
            }

            try
            {
                await step();
            }
            finally
            {
                await db.Database.ExecuteSqlRawAsync(
                    "EXEC sp_releaseapplock @Resource = @resource, @LockOwner = 'Session'",
                    [new SqlParameter("@resource", resource)],
                    CancellationToken.None);
            }
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }

    public static bool IsUniqueViolation(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is SqlException sql && sql.Errors.Cast<SqlError>().Any(e => e.Number is 2601 or 2627))
            {
                return true;
            }
        }

        return false;
    }

    public static async Task EnsureUserNameKeysAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var normalizer = scope.ServiceProvider.GetRequiredService<ILookupNormalizer>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbSeeder");

        var users = await db.Users.ToListAsync(cancellationToken);
        var desired = users
            .Select(u => (User: u, Key: normalizer.NormalizeName(u.UserName)))
            .ToList();

        var conflicts = desired
            .Where(d => d.Key is not null)
            .GroupBy(d => d.Key!, StringComparer.Ordinal)
            .Where(g => g.Count() > 1)
            .ToList();
        if (conflicts.Count > 0)
        {
            var details = string.Join("; ", conflicts.Select(g => $"[{string.Join(", ", g.Select(d => $"{d.User.UserName} (kimlik {d.User.Id})"))}]"));
            throw new UserNameConflictException(
                $"Kullanıcı adı normalizasyonu sonrasında aynı anahtara düşen hesaplar var: {details}. Başlangıç durduruldu; bu hesaplardan birinin kullanıcı adını veritabanında değiştirin.");
        }

        var changed = 0;
        foreach (var (user, key) in desired)
        {
            if (!string.Equals(user.NormalizedUserName, key, StringComparison.Ordinal))
            {
                user.NormalizedUserName = key;
                changed++;
            }
        }

        if (changed > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("{Count} kullanıcının normalleştirilmiş kullanıcı adı anahtarı güncellendi.", changed);
        }
    }

    public static async Task EnsureAiAccountAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbSeeder");

        var normalizedName = userManager.NormalizeName(SystemAccounts.AiUserName);

        var user = await db.Users.FirstOrDefaultAsync(u => u.NormalizedUserName == normalizedName, cancellationToken);
        await VerifyAiIntegrityAsync(db, user?.Id, cancellationToken);

        if (user is null)
        {
            user = new ApplicationUser
            {
                UserName = SystemAccounts.AiUserName,
                NormalizedUserName = normalizedName,
                FirstName = SystemAccounts.AiFirstName,
                LastName = SystemAccounts.AiLastName,
                PasswordHash = null,
                SecurityStamp = Guid.NewGuid().ToString("N"),
                ConcurrencyStamp = Guid.NewGuid().ToString("N"),
                LockoutEnabled = false,
                MustChangePassword = false,
                IsBanned = false,
                CreatedAt = DateTime.UtcNow
            };
            db.Users.Add(user);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
                logger.LogInformation("Yapay zekâ sistem hesabı oluşturuldu: {UserName}", SystemAccounts.AiUserName);
            }
            catch (DbUpdateException ex)
            {
                logger.LogWarning(ex, "Yapay zekâ hesabı oluşturulamadı, mevcut kayıt kontrol ediliyor.");
                db.ChangeTracker.Clear();
                user = await db.Users.FirstOrDefaultAsync(u => u.NormalizedUserName == normalizedName, cancellationToken);
                if (user is null)
                {
                    throw;
                }

                await VerifyAiIntegrityAsync(db, user.Id, cancellationToken);
            }
        }

        var hasAiRole = await db.UserRoles.AnyAsync(ur => ur.UserId == user.Id && ur.RoleId == Roles.AiId, cancellationToken);
        if (!hasAiRole)
        {
            db.UserRoles.Add(new IdentityUserRole<int> { UserId = user.Id, RoleId = Roles.AiId });
        }

        var repaired = false;
        if (user.PasswordHash is not null)
        {
            user.PasswordHash = null;
            repaired = true;
        }

        if (user.LockoutEnabled || user.LockoutEnd is not null || user.AccessFailedCount != 0)
        {
            user.LockoutEnabled = false;
            user.LockoutEnd = null;
            user.AccessFailedCount = 0;
            repaired = true;
        }

        if (user.MustChangePassword || user.IsBanned)
        {
            user.MustChangePassword = false;
            user.IsBanned = false;
            user.BannedAt = null;
            user.BannedByUserId = null;
            repaired = true;
        }

        if (repaired)
        {
            user.SecurityStamp = Guid.NewGuid().ToString("N");
            user.ConcurrencyStamp = Guid.NewGuid().ToString("N");
            logger.LogWarning("Yapay zekâ sistem hesabı sistem kurallarına göre onarıldı.");
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static async Task VerifyAiIntegrityAsync(AppDbContext db, int? aiUserId, CancellationToken cancellationToken)
    {
        if (aiUserId is int id)
        {
            var extraRoleIds = await db.UserRoles
                .Where(ur => ur.UserId == id && ur.RoleId != Roles.AiId)
                .Select(ur => ur.RoleId)
                .ToListAsync(cancellationToken);
            if (extraRoleIds.Count > 0)
            {
                throw new SystemAccountIntegrityException(
                    $"'{SystemAccounts.AiUserName}' sistem hesabı yapay zekâ dışında bir role sahip (rol kimlikleri: {string.Join(", ", extraRoleIds)}). Başlangıç durduruldu; veritabanındaki kullanıcı-rol kayıtlarını düzeltin.");
            }
        }

        var otherAiUserIds = await db.UserRoles
            .Where(ur => ur.RoleId == Roles.AiId && ur.UserId != (aiUserId ?? 0))
            .Select(ur => ur.UserId)
            .ToListAsync(cancellationToken);
        if (otherAiUserIds.Count > 0)
        {
            throw new SystemAccountIntegrityException(
                $"Yapay zekâ rolünde '{SystemAccounts.AiUserName}' dışında kullanıcı(lar) bulundu (kimlikler: {string.Join(", ", otherAiUserIds)}). Yalnızca tek bir sistem hesabı olabilir. Başlangıç durduruldu; fazla hesapları veritabanından kaldırın.");
        }
    }

    public static async Task BackfillCommentFingerprintsAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbSeeder");

        var total = 0;
        var skipped = 0;
        var lastSeenId = 0;
        while (true)
        {
            var batch = await db.Comments
                .AsNoTracking()
                .Where(c => c.BodyFingerprint == "" && c.Id > lastSeenId)
                .OrderBy(c => c.Id)
                .Select(c => new { c.Id, c.Body })
                .Take(500)
                .ToListAsync(cancellationToken);
            if (batch.Count == 0)
            {
                break;
            }

            foreach (var item in batch)
            {
                var fingerprint = CommentRules.Fingerprint(item.Body);
                var id = item.Id;
                var affected = await db.Comments
                    .Where(c => c.Id == id && c.BodyFingerprint == "")
                    .ExecuteUpdateAsync(s => s.SetProperty(c => c.BodyFingerprint, fingerprint), cancellationToken);
                if (affected == 0)
                {
                    skipped++;
                }
                else
                {
                    total++;
                }
            }

            lastSeenId = batch[^1].Id;
        }

        if (total > 0)
        {
            logger.LogInformation("{Count} yorum için içerik parmak izi dolduruldu.", total);
        }

        if (skipped > 0)
        {
            logger.LogInformation("{Count} yorum başka bir örnek tarafından güncellendiği için atlandı.", skipped);
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

        var userName = UserNameRules.Canonicalize(options.AdminUserName);
        if (!UserNameRules.IsValid(userName))
        {
            logger.LogError("Seed:AdminUserName geçerli bir kullanıcı adı olmadığından müdür hesabı oluşturulmadı.");
            return;
        }

        if (UserNameRules.IsReserved(userName))
        {
            logger.LogError("Seed:AdminUserName sistem hesapları için ayrılmış bir ad olduğundan müdür hesabı oluşturulmadı.");
            return;
        }

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
            MustChangePassword = true,
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
