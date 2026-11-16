using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Leaderboard;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Points;
using LGSApp.Infrastructure.Services.Reports;
using LGSApp.Infrastructure.Services.Questions;
using LGSApp.Infrastructure.Services.Settings;
using LGSApp.Infrastructure.Services.Stats;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace LGSApp.Tests.Questions;

public sealed class QuestionIdempotencyTests : IAsyncLifetime
{
    private const string Server = "Server=(localdb)\\MSSQLLocalDB;Trusted_Connection=True;TrustServerCertificate=True;";
    private readonly string _database = "LGSApp_Test_" + Guid.NewGuid().ToString("N");
    private readonly TurkeyTime _clock = new(TimeProvider.System);
    private readonly string _description = new('a', 40);
    private bool _available;
    private int _userId;
    private int _lessonId;

    private string ConnectionString => $"{Server}Database={_database};";

    private AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(ConnectionString).Options);

    public async Task InitializeAsync()
    {
        try
        {
            await using var db = NewDb();
            await db.Database.MigrateAsync();
            _available = true;
        }
        catch (SqlException)
        {
            return;
        }

        await using var seed = NewDb();
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
        await SetAsync(seed, SettingKeys.GunlukSoruYuklemeLimiti, "2");
        await SetAsync(seed, SettingKeys.PuanliSoruYuklemeGunluk, "1");
        await SetAsync(seed, SettingKeys.PuanSoruYukleme, "3");
        await SetAsync(seed, SettingKeys.AciklamaMinKarakter, "10");
        _userId = user.Id;
        _lessonId = lesson.Id;
    }

    private static async Task SetAsync(AppDbContext db, string key, string value)
    {
        var row = await db.Settings.FindAsync(key);
        if (row is null)
        {
            db.Settings.Add(new Setting { Key = key, Value = value });
        }
        else
        {
            row.Value = value;
        }

        await db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        await db.Database.EnsureDeletedAsync();
    }

    private async Task<int> AddFileAsync(AppDbContext db)
    {
        var file = new StoredFile
        {
            Container = "c",
            BlobName = Guid.NewGuid().ToString("N"),
            ContentType = "image/jpeg",
            SizeBytes = 10,
            Purpose = FilePurpose.QuestionImage,
            Status = FileStatus.Ready,
            Width = 10,
            Height = 10,
            ConfirmedAt = DateTime.UtcNow,
            UploadedByUserId = _userId
        };
        db.StoredFiles.Add(file);
        await db.SaveChangesAsync();
        return file.Id;
    }

    private SettingsService NewSettings(AppDbContext db) => new(db, new MemoryCache(new MemoryCacheOptions()));

    private QuestionAuthoringService NewService(AppDbContext db) =>
        new(db, NewSettings(db), new StoredFileValidator(db), new PointService(db, _clock), new StubQuestionService(), new StubFileUrls(), _clock);

    private CreateQuestionCommand Command(int imageId, Guid? requestId, string? description = null) =>
        new(_lessonId, null, null, imageId, null, null, null, null, 2, description ?? _description, null, requestId);

    private Actor Student => new(_userId, Roles.Ogrenci);

    [Fact]
    public async Task Same_request_id_returns_the_existing_question_without_counting_again()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewService(db);
        var imageId = await AddFileAsync(db);
        var requestId = Guid.NewGuid();

        var first = await service.CreateAsync(Student, Command(imageId, requestId));
        var second = await service.CreateAsync(Student, Command(imageId, requestId));

        Assert.True(first.Succeeded);
        Assert.True(first.Value!.Created);
        Assert.True(second.Succeeded);
        Assert.False(second.Value!.Created);
        Assert.Equal(first.Value.Question.Id, second.Value.Question.Id);
        Assert.Equal(1, await db.CountUploadedAsync(_userId, _clock.Today, default));
        Assert.Equal(1, await db.CountScoredAsync(_userId, _clock.Today, default));
        Assert.Equal(3, await db.Users.AsNoTracking().Where(u => u.Id == _userId).Select(u => u.Points).SingleAsync());
    }

    [Fact]
    public async Task Same_request_id_with_different_content_is_unprocessable()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewService(db);
        var imageId = await AddFileAsync(db);
        var requestId = Guid.NewGuid();

        await service.CreateAsync(Student, Command(imageId, requestId));
        var changed = await service.CreateAsync(Student, Command(imageId, requestId, new string('b', 40)));

        Assert.False(changed.Succeeded);
        Assert.Equal(ServiceErrorKind.Unprocessable, changed.Error);
        Assert.Equal(1, await db.CountUploadedAsync(_userId, _clock.Today, default));
    }

    [Fact]
    public async Task Replay_still_succeeds_after_the_daily_limit_is_reached()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewService(db);
        var firstImage = await AddFileAsync(db);
        var firstRequest = Guid.NewGuid();
        await service.CreateAsync(Student, Command(firstImage, firstRequest));
        await service.CreateAsync(Student, Command(await AddFileAsync(db), Guid.NewGuid()));
        var third = await service.CreateAsync(Student, Command(await AddFileAsync(db), Guid.NewGuid()));
        var replay = await service.CreateAsync(Student, Command(firstImage, firstRequest));

        Assert.Equal(ServiceErrorKind.TooManyRequests, third.Error);
        Assert.True(replay.Succeeded);
        Assert.False(replay.Value!.Created);
        Assert.Equal(2, await db.CountUploadedAsync(_userId, _clock.Today, default));
    }

    [Fact]
    public async Task Empty_request_id_is_rejected()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var result = await NewService(db).CreateAsync(Student, Command(await AddFileAsync(db), Guid.Empty));

        Assert.Equal(ServiceErrorKind.Validation, result.Error);
    }

    [Fact]
    public async Task Requests_without_request_id_are_not_deduplicated()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewService(db);
        var a = await service.CreateAsync(Student, Command(await AddFileAsync(db), null));
        var b = await service.CreateAsync(Student, Command(await AddFileAsync(db), null));

        Assert.NotEqual(a.Value!.Question.Id, b.Value!.Question.Id);
        Assert.True(a.Value.Created && b.Value.Created);
    }

    [Fact]
    public async Task Stats_report_todays_upload_and_scoring_state_from_the_same_counters()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewService(db);
        await service.CreateAsync(Student, Command(await AddFileAsync(db), Guid.NewGuid()));
        await service.CreateAsync(Student, Command(await AddFileAsync(db), Guid.NewGuid()));

        var stats = new StudentStatsService(db, new StubLeaderboard(), NewSettings(db), _clock);
        var view = (await stats.GetAsync(_userId)).Value!.UploadToday;

        Assert.Equal(_clock.Today, view.Date);
        Assert.Equal(2, view.Uploaded);
        Assert.Equal(2, view.DailyLimit);
        Assert.Equal(0, view.Remaining);
        Assert.Equal(3, view.PointsPerQuestion);
        Assert.Equal(1, view.ScoredLimit);
        Assert.Equal(1, view.ScoredToday);
        Assert.Equal(0, view.ScoredRemaining);
    }

    private async Task<int> AddOtherQuestionAsync(AppDbContext db, bool hidden = false, bool published = true)
    {
        var author = new ApplicationUser
        {
            UserName = "yazar" + Guid.NewGuid().ToString("N")[..6],
            NormalizedUserName = "YAZAR" + Guid.NewGuid().ToString("N")[..6],
            SecurityStamp = Guid.NewGuid().ToString(),
            FirstName = "Y",
            LastName = "Z"
        };
        db.Users.Add(author);
        await db.SaveChangesAsync();
        var question = new Question
        {
            AuthorUserId = author.Id,
            LessonId = _lessonId,
            Source = QuestionSource.Student,
            Text = "Soru",
            CorrectOption = 1,
            IsHidden = hidden,
            PublishedAt = published ? DateTime.UtcNow : null,
            CreatedAt = DateTime.UtcNow
        };
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        return question.Id;
    }

    private ReportService NewReports(AppDbContext db) =>
        new(db, NewSettings(db), new QuestionAccessService(db, _clock), _clock);

    private static readonly string ReportText = new('x', 60);

    [Fact]
    public async Task Student_can_report_a_published_question_without_answering()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var questionId = await AddOtherQuestionAsync(db);
        var result = await NewReports(db).CreateForQuestionAsync(Student, questionId, new CreateReportCommand(ReportReason.Unreadable, ReportText));

        Assert.True(result.Succeeded);
        Assert.Equal(ReportStatus.Pending, result.Value!.Status);
    }

    [Fact]
    public async Task Wrong_answer_key_report_still_requires_an_answer()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var questionId = await AddOtherQuestionAsync(db);
        var result = await NewReports(db).CreateForQuestionAsync(Student, questionId, new CreateReportCommand(ReportReason.WrongAnswerKey, ReportText));

        Assert.Equal(ServiceErrorKind.Validation, result.Error);
        Assert.Equal(ReportService.WrongAnswerKeyNeedsAnswerMessage, result.Message);
    }

    [Fact]
    public async Task Hidden_unpublished_and_duplicate_question_reports_are_rejected()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var reports = NewReports(db);
        var command = new CreateReportCommand(ReportReason.Other, ReportText);
        var hidden = await reports.CreateForQuestionAsync(Student, await AddOtherQuestionAsync(db, hidden: true), command);
        var unpublished = await reports.CreateForQuestionAsync(Student, await AddOtherQuestionAsync(db, published: false), command);
        var visibleId = await AddOtherQuestionAsync(db);
        var first = await reports.CreateForQuestionAsync(Student, visibleId, command);
        var second = await reports.CreateForQuestionAsync(Student, visibleId, command);

        Assert.Equal(ServiceErrorKind.NotFound, hidden.Error);
        Assert.Equal(ServiceErrorKind.NotFound, unpublished.Error);
        Assert.True(first.Succeeded);
        Assert.Equal(ServiceErrorKind.Conflict, second.Error);
    }

    [Fact]
    public async Task Own_question_cannot_be_reported()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var created = await NewService(db).CreateAsync(Student, Command(await AddFileAsync(db), Guid.NewGuid()));
        var result = await NewReports(db).CreateForQuestionAsync(Student, created.Value!.Question.Id, new CreateReportCommand(ReportReason.Other, ReportText));

        Assert.Equal(ServiceErrorKind.Validation, result.Error);
    }

    private sealed class StubQuestionService : IQuestionService
    {
        public Task<ServiceResult<QuestionDetailView>> GetDetailAsync(Actor actor, int questionId, CancellationToken cancellationToken = default) =>
            Task.FromResult(ServiceResult<QuestionDetailView>.Ok(new QuestionDetailView(
                questionId, QuestionSource.Student, new LessonRefView(1, "x"), null, null, null, null, null,
                new QuestionOptionsView(null, null, null, null), null, DateTime.UtcNow, null, null, null, null, null, null,
                new QuestionPermissionsView(false, false, false, false, false, false), null, false, null, "none", null, null, null, false, null)));
    }

    private sealed class StubFileUrls : IFileUrlService
    {
        public Task<IReadOnlyDictionary<int, ImageView>> GetAsync(IEnumerable<int?> fileIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyDictionary<int, ImageView>>(new Dictionary<int, ImageView>());
    }

    private sealed class StubLeaderboard : ILeaderboardService
    {
        public Task<ServiceResult<LeaderboardView>> GetAsync(Actor actor, LeaderboardPeriod period, int offset, int top, CancellationToken cancellationToken = default) =>
            Task.FromResult<ServiceResult<LeaderboardView>>(Fail.NotFound("yok"));
    }
}
