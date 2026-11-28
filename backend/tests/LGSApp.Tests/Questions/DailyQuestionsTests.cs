using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Questions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Tests.Questions;

public sealed class DailyQuestionsTests : IAsyncLifetime
{
    private static readonly DateTime Day1Evening = new(2026, 11, 26, 16, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Day2BoundaryStart = new(2026, 11, 26, 21, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Day2AfterMidnight = new(2026, 11, 26, 21, 30, 0, DateTimeKind.Utc);
    private static readonly DateTime Day2Evening = new(2026, 11, 27, 16, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Day2EndExclusive = new(2026, 11, 27, 21, 0, 0, DateTimeKind.Utc);

    private readonly string _database = TestDatabase.NewName();
    private bool _available;
    private int _student;
    private int _teacher;
    private int _fenLesson;
    private byte _slot;
    private int _mathLesson;

    public async Task InitializeAsync()
    {
        _available = await TestDatabase.TryCreateAsync(_database, async db =>
        {
            var math = new Lesson { Name = "Matematik", Session = LessonSession.Sayisal, OrderNo = 1, IsActive = true };
            var fen = new Lesson { Name = "Fen Bilimleri", Session = LessonSession.Sayisal, OrderNo = 2, IsActive = true };
            db.Lessons.AddRange(math, fen);
            await db.SaveChangesAsync();
            _mathLesson = math.Id;
            _fenLesson = fen.Id;

            _teacher = await AddUserAsync(db, "ogretmen1", Roles.OgretmenId);
            _student = await AddUserAsync(db, "ali", Roles.OgrenciId);
        });
    }

    public async Task DisposeAsync()
    {
        if (_available)
        {
            await TestDatabase.DropAsync(_database);
        }
    }

    private sealed class EmptyFileUrls : IFileUrlService
    {
        public Task<IReadOnlyDictionary<int, ImageView>> GetAsync(IEnumerable<int?> fileIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyDictionary<int, ImageView>>(new Dictionary<int, ImageView>());
    }

    private static async Task<int> AddUserAsync(AppDbContext db, string name, int roleId)
    {
        var user = new ApplicationUser
        {
            UserName = name,
            NormalizedUserName = name.ToUpperInvariant(),
            SecurityStamp = Guid.NewGuid().ToString(),
            FirstName = name,
            LastName = "Test"
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        db.UserRoles.Add(new IdentityUserRole<int> { UserId = user.Id, RoleId = roleId });
        await db.SaveChangesAsync();
        return user.Id;
    }

    private AppDbContext NewContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(TestDatabase.ConnectionString(_database)).Options);

    private async Task<int> AddQuestionAsync(QuestionSource source, int lessonId, DateTime? publishedAt, bool hidden = false, DateOnly? scheduledFor = null)
    {
        await using var db = NewContext();
        var question = new Question
        {
            AuthorUserId = _teacher,
            LessonId = lessonId,
            Source = source,
            Text = "Soru",
            CorrectOption = 1,
            PublishedAt = publishedAt,
            IsHidden = hidden,
            ScheduledPublishDate = scheduledFor,
            GenerationDate = source == QuestionSource.Ai ? new DateOnly(2026, 11, 1) : null,
            GenerationSlot = source == QuestionSource.Ai ? ++_slot : null,
            CreatedAt = DateTime.UtcNow
        };
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        return question.Id;
    }

    private async Task<DailyQuestionsView> DailyAsync()
    {
        await using var db = NewContext();
        var service = new QuestionPoolService(db, new UserLookupService(db), new EmptyFileUrls(), new TurkeyTime(TimeProvider.System));
        return (await service.DailyAsync(new Actor(_student, Roles.Ogrenci))).Value!;
    }

    [Fact]
    public async Task Empty_pool_returns_null_date_and_no_items()
    {
        if (!_available)
        {
            return;
        }

        var result = await DailyAsync();

        Assert.Null(result.Date);
        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task Only_ai_questions_are_returned()
    {
        if (!_available)
        {
            return;
        }

        var ai = await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day2Evening);
        await AddQuestionAsync(QuestionSource.Teacher, _mathLesson, Day2Evening.AddMinutes(5));
        await AddQuestionAsync(QuestionSource.Student, _mathLesson, Day2Evening.AddMinutes(10));

        var result = await DailyAsync();

        Assert.Equal([ai], result.Items.Select(i => i.Id).ToList());
        Assert.All(result.Items, i => Assert.Equal(QuestionSource.Ai, i.Source));
    }

    [Fact]
    public async Task Hidden_scheduled_and_assignment_bound_questions_are_excluded()
    {
        if (!_available)
        {
            return;
        }

        var visible = await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day2Evening);
        await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day2Evening.AddMinutes(1), hidden: true);
        await AddQuestionAsync(QuestionSource.Ai, _mathLesson, null, scheduledFor: new DateOnly(2026, 11, 30));
        var bound = await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day2Evening.AddMinutes(2));

        await using (var db = NewContext())
        {
            var assignment = new Assignment
            {
                TeacherUserId = _teacher,
                LessonId = _mathLesson,
                Title = "Ödev",
                StartDate = new DateOnly(2026, 11, 20),
                EndDate = new DateOnly(2026, 12, 20),
                CreatedAt = DateTime.UtcNow
            };
            db.Assignments.Add(assignment);
            await db.SaveChangesAsync();
            db.AssignmentQuestions.Add(new AssignmentQuestion { AssignmentId = assignment.Id, QuestionId = bound });
            await db.SaveChangesAsync();
        }

        var result = await DailyAsync();

        Assert.Equal([visible], result.Items.Select(i => i.Id).ToList());
    }

    [Fact]
    public async Task Turkey_day_boundary_splits_questions_at_utc_2100()
    {
        if (!_available)
        {
            return;
        }

        var beforeBoundary = await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day2BoundaryStart.AddMinutes(-1));
        var atBoundary = await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day2BoundaryStart);
        var afterMidnight = await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day2AfterMidnight);
        var lastMoment = await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day2EndExclusive.AddMinutes(-1));

        var result = await DailyAsync();

        Assert.Equal(new DateOnly(2026, 11, 27), result.Date);
        Assert.Equal([atBoundary, afterMidnight, lastMoment], result.Items.Select(i => i.Id).ToList());
        Assert.DoesNotContain(result.Items, i => i.Id == beforeBoundary);
    }

    [Fact]
    public async Task Latest_published_day_is_selected()
    {
        if (!_available)
        {
            return;
        }

        await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day1Evening);
        var latest = await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day2Evening);

        var result = await DailyAsync();

        Assert.Equal(new DateOnly(2026, 11, 27), result.Date);
        Assert.Equal([latest], result.Items.Select(i => i.Id).ToList());
    }

    [Fact]
    public async Task Latest_day_ignores_newer_non_ai_questions()
    {
        if (!_available)
        {
            return;
        }

        var ai = await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day1Evening);
        await AddQuestionAsync(QuestionSource.Teacher, _mathLesson, Day2Evening);

        var result = await DailyAsync();

        Assert.Equal(new DateOnly(2026, 11, 26), result.Date);
        Assert.Equal([ai], result.Items.Select(i => i.Id).ToList());
    }

    [Fact]
    public async Task Items_are_ordered_by_lesson_name_then_id()
    {
        if (!_available)
        {
            return;
        }

        var math1 = await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day2Evening);
        var fen1 = await AddQuestionAsync(QuestionSource.Ai, _fenLesson, Day2Evening);
        var math2 = await AddQuestionAsync(QuestionSource.Ai, _mathLesson, Day2Evening);
        var fen2 = await AddQuestionAsync(QuestionSource.Ai, _fenLesson, Day2Evening);

        var result = await DailyAsync();

        Assert.Equal([fen1, fen2, math1, math2], result.Items.Select(i => i.Id).ToList());
    }
}
