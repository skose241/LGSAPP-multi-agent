using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Leaderboard;
using LGSApp.Infrastructure.Services.Settings;
using LGSApp.Infrastructure.Services.Stats;
using LGSApp.Infrastructure.Services.Students;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;

namespace LGSApp.Tests.Stats;

public sealed class StudentDirectoryTests : IAsyncLifetime
{
    private readonly string _database = TestDatabase.NewName();
    private readonly TurkeyTime _clock = new(TimeProvider.System);
    private bool _available;
    private int _lessonId;
    private int _teacher;
    private int _mudur;
    private int _ai;
    private int _ali;
    private int _veli;
    private int _banned;
    private int _idle;
    private ServiceProvider _provider = null!;

    private Actor TeacherActor => new(_teacher, Roles.Ogretmen);
    private Actor MudurActor => new(_mudur, Roles.Mudur);

    public async Task InitializeAsync()
    {
        _available = await TestDatabase.TryCreateAsync(_database, async db =>
        {
            var lesson = new Lesson { Name = "Matematik", Session = LessonSession.Sayisal, OrderNo = 1, IsActive = true };
            db.Lessons.Add(lesson);
            await db.SaveChangesAsync();
            _lessonId = lesson.Id;

            _teacher = await AddUserAsync(db, "ogretmen1", "Ayse", "Hoca", Roles.OgretmenId, 0, false);
            _mudur = await AddUserAsync(db, "mudur1", "Mudur", "Bey", Roles.MudurId, 0, false);
            _ai = await AddUserAsync(db, "ai1", "Yapay", "Zeka", Roles.AiId, 0, false);
            _ali = await AddUserAsync(db, "ali", "Ali", "Yilmaz", Roles.OgrenciId, 30, false);
            _veli = await AddUserAsync(db, "veli", "Veli", "Kaya", Roles.OgrenciId, 50, false);
            _banned = await AddUserAsync(db, "banli", "Hasan", "Demir", Roles.OgrenciId, 10, true);
            _idle = await AddUserAsync(db, "zeynep", "Zeynep", "Ak", Roles.OgrenciId, 5, false);

            var q1 = await AddQuestionAsync(db);
            var q2 = await AddQuestionAsync(db);
            var q3 = await AddQuestionAsync(db);
            var now = DateTime.UtcNow;
            db.Answers.AddRange(
                new Answer { QuestionId = q1, UserId = _ali, SelectedOption = 1, IsCorrect = true, AnsweredAt = now.AddHours(-5) },
                new Answer { QuestionId = q2, UserId = _ali, SelectedOption = 2, IsCorrect = false, AnsweredAt = now.AddHours(-2) },
                new Answer { QuestionId = q3, UserId = _ali, SelectedOption = 1, IsCorrect = true, AnsweredAt = now.AddHours(-1) },
                new Answer { QuestionId = q1, UserId = _veli, SelectedOption = 1, IsCorrect = true, AnsweredAt = now.AddHours(-10) },
                new Answer { QuestionId = q1, UserId = _banned, SelectedOption = 2, IsCorrect = false, AnsweredAt = now.AddHours(-20) },
                new Answer { QuestionId = q2, UserId = _banned, SelectedOption = 2, IsCorrect = false, AnsweredAt = now.AddHours(-19) });
            db.PointTransactions.Add(new PointTransaction
            {
                UserId = _ali,
                Amount = 30,
                Reason = PointReason.ManualAdjustment,
                LocalDate = _clock.Today,
                CreatedAt = now
            });
            db.PointTransactions.Add(new PointTransaction
            {
                UserId = _veli,
                Amount = 20,
                Reason = PointReason.ManualAdjustment,
                LocalDate = _clock.Today,
                CreatedAt = now
            });
            await db.SaveChangesAsync();
        });

        var services = new ServiceCollection();
        services.AddMemoryCache();
        services.AddSingleton(_clock);
        services.AddSingleton<ILeaderboardCache, LeaderboardCache>();
        services.AddDbContext<AppDbContext>(options => options.UseSqlServer(TestDatabase.ConnectionString(_database)));
        services.AddScoped<ISettingsService, SettingsService>();
        services.AddScoped<ILeaderboardService, LeaderboardService>();
        services.AddScoped<IStudentStatsService, StudentStatsService>();
        services.AddScoped<IStudentDirectoryService, StudentDirectoryService>();
        _provider = services.BuildServiceProvider();
    }

    public async Task DisposeAsync()
    {
        await _provider.DisposeAsync();
        if (_available)
        {
            await TestDatabase.DropAsync(_database);
        }
    }

    private static async Task<int> AddUserAsync(AppDbContext db, string name, string first, string last, int roleId, int points, bool banned)
    {
        var user = new ApplicationUser
        {
            UserName = name,
            NormalizedUserName = name.ToUpperInvariant(),
            SecurityStamp = Guid.NewGuid().ToString(),
            FirstName = first,
            LastName = last,
            Points = points,
            IsBanned = banned
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        db.UserRoles.Add(new IdentityUserRole<int> { UserId = user.Id, RoleId = roleId });
        await db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<int> AddQuestionAsync(AppDbContext db)
    {
        var question = new Question
        {
            AuthorUserId = _teacher,
            LessonId = _lessonId,
            Source = QuestionSource.Teacher,
            Text = "Soru",
            CorrectOption = 1,
            PublishedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        return question.Id;
    }

    private async Task<T> WithServiceAsync<T>(Func<IStudentDirectoryService, Task<T>> action)
    {
        await using var scope = _provider.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<IStudentDirectoryService>());
    }

    private Task<ServiceResult<StudentListView>> ListAsync(string? search = null, string? sort = null, int page = 1, int pageSize = 20, Actor? actor = null) =>
        WithServiceAsync(s => s.ListAsync(actor ?? TeacherActor, new StudentListQuery(search, sort, page, pageSize)));

    [Fact]
    public async Task Only_students_are_listed_and_banned_ones_are_flagged()
    {
        if (!_available)
        {
            return;
        }

        var view = (await ListAsync()).Value!;

        Assert.Equal(4, view.TotalCount);
        Assert.Equal(["ali", "banli", "veli", "zeynep"], view.Items.Select(i => i.UserName).ToList());
        Assert.Equal("name", view.Sort);
        Assert.True(view.Items.Single(i => i.UserName == "banli").IsBanned);
        Assert.False(view.Items.Single(i => i.UserName == "ali").IsBanned);
    }

    [Fact]
    public async Task Rows_carry_totals_rate_and_last_activity()
    {
        if (!_available)
        {
            return;
        }

        var items = (await ListAsync(actor: MudurActor)).Value!.Items;
        var ali = items.Single(i => i.UserName == "ali");
        var idle = items.Single(i => i.UserName == "zeynep");

        Assert.Equal("Ali Yilmaz", ali.FullName);
        Assert.Equal(30, ali.Points);
        Assert.Equal(3, ali.Answered);
        Assert.Equal(2, ali.Correct);
        Assert.Equal(1, ali.Wrong);
        Assert.Equal(66.7, ali.SuccessRate);
        Assert.NotNull(ali.LastAnsweredAt);
        Assert.Equal(0, idle.Answered);
        Assert.Null(idle.SuccessRate);
        Assert.Null(idle.LastAnsweredAt);
    }

    [Theory]
    [InlineData("ALI", new[] { "ali" })]
    [InlineData("kaya", new[] { "veli" })]
    [InlineData("HASAN", new[] { "banli" })]
    [InlineData("ban", new[] { "banli" })]
    [InlineData("zey", new[] { "zeynep" })]
    [InlineData("ayse", new string[0])]
    [InlineData("hasan dem", new[] { "banli" })]
    public async Task Search_matches_user_name_first_name_and_last_name_ignoring_case(string search, string[] expected)
    {
        if (!_available)
        {
            return;
        }

        var view = (await ListAsync(search)).Value!;

        Assert.Equal(expected, view.Items.Select(i => i.UserName).ToArray());
        Assert.Equal(expected.Length, view.TotalCount);
    }

    [Fact]
    public async Task Sort_options_order_rows()
    {
        if (!_available)
        {
            return;
        }

        Assert.Equal(["veli", "ali", "banli", "zeynep"], (await ListAsync(sort: "points")).Value!.Items.Select(i => i.UserName).ToList());
        Assert.Equal(["ali", "banli", "veli", "zeynep"], (await ListAsync(sort: "answered")).Value!.Items.Select(i => i.UserName).ToList());
        Assert.Equal(["ali", "veli", "banli", "zeynep"], (await ListAsync(sort: "lastActive")).Value!.Items.Select(i => i.UserName).ToList());
        Assert.Equal(["ali", "banli", "veli", "zeynep"], (await ListAsync(sort: "NAME")).Value!.Items.Select(i => i.UserName).ToList());
    }

    [Fact]
    public async Task Unknown_sort_and_bad_paging_are_validation_errors()
    {
        if (!_available)
        {
            return;
        }

        Assert.Equal(ServiceErrorKind.Validation, (await ListAsync(sort: "xyz")).Error);
        Assert.Equal(ServiceErrorKind.Validation, (await ListAsync(page: 0)).Error);
        Assert.Equal(ServiceErrorKind.Validation, (await ListAsync(pageSize: 0)).Error);
        Assert.Equal(ServiceErrorKind.Validation, (await ListAsync(pageSize: 51)).Error);
        Assert.True((await ListAsync(pageSize: 50)).Succeeded);
    }

    [Fact]
    public async Task Paging_slices_the_ordered_list()
    {
        if (!_available)
        {
            return;
        }

        var second = (await ListAsync(page: 2, pageSize: 3)).Value!;
        Assert.Equal(4, second.TotalCount);
        Assert.Equal(["zeynep"], second.Items.Select(i => i.UserName).ToList());
        Assert.Empty((await ListAsync(page: 5, pageSize: 3)).Value!.Items);
    }

    [Fact]
    public async Task Students_cannot_use_the_directory()
    {
        if (!_available)
        {
            return;
        }

        var student = new Actor(_ali, Roles.Ogrenci);

        Assert.Equal(ServiceErrorKind.Forbidden, (await ListAsync(actor: student)).Error);
        Assert.Equal(ServiceErrorKind.Forbidden, (await WithServiceAsync(s => s.GetStatsAsync(student, _ali))).Error);
    }

    [Fact]
    public async Task Stats_return_header_and_the_same_data_as_the_student_sees()
    {
        if (!_available)
        {
            return;
        }

        var viaTeacher = (await WithServiceAsync(s => s.GetStatsAsync(TeacherActor, _ali))).Value!;

        await using var scope = _provider.CreateAsyncScope();
        var own = (await scope.ServiceProvider.GetRequiredService<IStudentStatsService>().GetAsync(_ali)).Value!;

        Assert.Equal(_ali, viaTeacher.Student.Id);
        Assert.Equal("ali", viaTeacher.Student.UserName);
        Assert.Equal("Ali Yilmaz", viaTeacher.Student.FullName);
        Assert.False(viaTeacher.Student.IsBanned);
        Assert.Equal(3, viaTeacher.Stats.Totals.Answered);
        Assert.Equal(2, viaTeacher.Stats.Totals.Correct);
        Assert.Equal(own.Totals, viaTeacher.Stats.Totals);
        Assert.Equal(own.Points, viaTeacher.Stats.Points);
        Assert.Equal(own.Contributions, viaTeacher.Stats.Contributions);
    }

    [Fact]
    public async Task Teacher_view_carries_the_students_own_weekly_and_monthly_standing()
    {
        if (!_available)
        {
            return;
        }

        var ali = (await WithServiceAsync(s => s.GetStatsAsync(TeacherActor, _ali))).Value!.Stats.Points;
        var veli = (await WithServiceAsync(s => s.GetStatsAsync(MudurActor, _veli))).Value!.Stats.Points;

        Assert.Equal(30, ali.Total);
        Assert.Equal(30, ali.Weekly.Points);
        Assert.Equal(1, ali.Weekly.Rank);
        Assert.Equal(30, ali.Monthly.Points);
        Assert.Equal(1, ali.Monthly.Rank);
        Assert.Equal(20, veli.Weekly.Points);
        Assert.Equal(2, veli.Weekly.Rank);
        Assert.Equal(2, veli.Monthly.Rank);
    }

    [Fact]
    public async Task Banned_student_stats_are_available_without_a_rank()
    {
        if (!_available)
        {
            return;
        }

        var result = (await WithServiceAsync(s => s.GetStatsAsync(TeacherActor, _banned))).Value!;

        Assert.True(result.Student.IsBanned);
        Assert.Equal(2, result.Stats.Totals.Answered);
        Assert.Null(result.Stats.Points.Weekly.Rank);
    }

    [Fact]
    public async Task Stats_for_non_students_or_missing_ids_are_not_found()
    {
        if (!_available)
        {
            return;
        }

        Assert.Equal(ServiceErrorKind.NotFound, (await WithServiceAsync(s => s.GetStatsAsync(MudurActor, _teacher))).Error);
        Assert.Equal(ServiceErrorKind.NotFound, (await WithServiceAsync(s => s.GetStatsAsync(MudurActor, _ai))).Error);
        Assert.Equal(ServiceErrorKind.NotFound, (await WithServiceAsync(s => s.GetStatsAsync(MudurActor, 999999))).Error);
    }
}
