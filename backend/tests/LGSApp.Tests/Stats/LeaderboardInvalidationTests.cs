using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Leaderboard;
using LGSApp.Infrastructure.Services.Points;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LGSApp.Tests.Stats;

public sealed class LeaderboardInvalidationTests : IAsyncLifetime
{
    private readonly string _database = TestDatabase.NewName();
    private readonly TurkeyTime _clock = new(TimeProvider.System);
    private bool _available;
    private int _studentId;
    private int _lessonId;

    public async Task InitializeAsync()
    {
        _available = await TestDatabase.TryCreateAsync(_database, async seed =>
        {
            var user = new ApplicationUser
            {
                UserName = "ogrenci1",
                NormalizedUserName = "OGRENCI1",
                SecurityStamp = Guid.NewGuid().ToString(),
                FirstName = "Test",
                LastName = "Ogrenci"
            };
            seed.Users.Add(user);
            var lesson = new Lesson { Name = "Matematik", Session = LessonSession.Sayisal, OrderNo = 1, IsActive = true };
            seed.Lessons.Add(lesson);
            await seed.SaveChangesAsync();
            seed.UserRoles.Add(new IdentityUserRole<int> { UserId = user.Id, RoleId = Roles.OgrenciId });
            await seed.SaveChangesAsync();
            _studentId = user.Id;
            _lessonId = lesson.Id;
        });
    }

    public Task DisposeAsync() => TestDatabase.DropAsync(_database);

    [Fact]
    public async Task Islem_disinda_puan_kaydi_onbellegi_hemen_bosaltir()
    {
        if (!_available)
        {
            return;
        }

        var cache = new CountingCache();
        await using var db = TestDatabase.Open(_database, new LeaderboardInvalidationInterceptor(cache));
        db.PointTransactions.Add(Point(5));
        await db.SaveChangesAsync();

        Assert.Equal(1, cache.Invalidations);
    }

    [Fact]
    public async Task Islem_icinde_puan_kaydi_commit_sonrasi_bosaltir()
    {
        if (!_available)
        {
            return;
        }

        var cache = new CountingCache();
        await using var db = TestDatabase.Open(_database, new LeaderboardInvalidationInterceptor(cache));
        await using var transaction = await db.Database.BeginTransactionAsync();
        db.PointTransactions.Add(Point(5));
        await db.SaveChangesAsync();

        Assert.Equal(0, cache.Invalidations);

        await transaction.CommitAsync();

        Assert.Equal(1, cache.Invalidations);
    }

    [Fact]
    public async Task Geri_alinan_islem_onbellege_dokunmaz()
    {
        if (!_available)
        {
            return;
        }

        var cache = new CountingCache();
        await using var db = TestDatabase.Open(_database, new LeaderboardInvalidationInterceptor(cache));
        await using (var transaction = await db.Database.BeginTransactionAsync())
        {
            db.PointTransactions.Add(Point(5));
            await db.SaveChangesAsync();
            await transaction.RollbackAsync();
        }

        db.ChangeTracker.Clear();
        await using (var second = await db.Database.BeginTransactionAsync())
        {
            await second.CommitAsync();
        }

        Assert.Equal(0, cache.Invalidations);
    }

    [Fact]
    public async Task Puan_disi_kayit_onbellege_dokunmaz()
    {
        if (!_available)
        {
            return;
        }

        var cache = new CountingCache();
        await using var db = TestDatabase.Open(_database, new LeaderboardInvalidationInterceptor(cache));
        await using var transaction = await db.Database.BeginTransactionAsync();
        db.Questions.Add(new Question
        {
            AuthorUserId = _studentId,
            LessonId = _lessonId,
            Source = QuestionSource.Student,
            Text = "Soru",
            CorrectOption = 1,
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();

        Assert.Equal(0, cache.Invalidations);
    }

    [Fact]
    public async Task Kazanilan_puan_liderlik_tablosuna_aninda_yansir()
    {
        if (!_available)
        {
            return;
        }

        var services = new ServiceCollection();
        services.AddMemoryCache();
        services.AddSingleton(_clock);
        services.AddSingleton<ILeaderboardCache, LeaderboardCache>();
        services.AddSingleton<LeaderboardInvalidationInterceptor>();
        services.AddDbContext<AppDbContext>((sp, options) => options
            .UseSqlServer(TestDatabase.ConnectionString(_database))
            .AddInterceptors(sp.GetRequiredService<LeaderboardInvalidationInterceptor>()));
        services.AddScoped<IPointService, PointService>();
        services.AddScoped<ILeaderboardService, LeaderboardService>();
        await using var provider = services.BuildServiceProvider();

        var student = new Actor(_studentId, Roles.Ogrenci);

        await using (var scope = provider.CreateAsyncScope())
        {
            var first = await scope.ServiceProvider.GetRequiredService<ILeaderboardService>()
                .GetAsync(student, LeaderboardPeriod.Weekly, 0, 10);
            Assert.Null(first.Value!.Me);
        }

        await using (var scope = provider.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var points = scope.ServiceProvider.GetRequiredService<IPointService>();
            await db.ExecuteInTransactionAsync(async token =>
            {
                await points.AwardAsync(_studentId, 7, PointReason.CorrectAnswer, null, null, null, null, token);
                await db.SaveChangesAsync(token);
                return 0;
            }, CancellationToken.None);
        }

        await using (var scope = provider.CreateAsyncScope())
        {
            var second = await scope.ServiceProvider.GetRequiredService<ILeaderboardService>()
                .GetAsync(student, LeaderboardPeriod.Weekly, 0, 10);
            Assert.NotNull(second.Value!.Me);
            Assert.Equal(7, second.Value.Me!.Points);
            Assert.Equal(1, second.Value.Me.Rank);
        }
    }

    private PointTransaction Point(int amount) => new()
    {
        UserId = _studentId,
        Amount = amount,
        Reason = PointReason.ManualAdjustment,
        LocalDate = _clock.Today,
        CreatedAt = DateTime.UtcNow
    };

    private sealed class CountingCache : ILeaderboardCache
    {
        public int Invalidations { get; private set; }

        public Task<T> GetOrLoadAsync<T>(string key, TimeSpan duration, Func<CancellationToken, Task<T>> loader, CancellationToken cancellationToken) =>
            loader(cancellationToken);

        public void Invalidate() => Invalidations++;
    }
}
