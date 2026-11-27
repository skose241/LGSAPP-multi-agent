using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Questions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Tests.Questions;

public sealed class QuestionPoolAuthorFilterTests : IAsyncLifetime
{
    private readonly string _database = TestDatabase.NewName();
    private bool _available;
    private int _teacher;
    private int _otherTeacher;
    private int _student;
    private int _published1;
    private int _published2;
    private int _hidden;
    private int _scheduled;
    private int _otherPublished;

    public async Task InitializeAsync()
    {
        _available = await TestDatabase.TryCreateAsync(_database, async db =>
        {
            var lesson = new Lesson { Name = "Matematik", Session = LessonSession.Sayisal, OrderNo = 1, IsActive = true };
            db.Lessons.Add(lesson);
            await db.SaveChangesAsync();

            _teacher = await AddUserAsync(db, "ogretmen1", Roles.OgretmenId);
            _otherTeacher = await AddUserAsync(db, "ogretmen2", Roles.OgretmenId);
            _student = await AddUserAsync(db, "ali", Roles.OgrenciId);

            var now = DateTime.UtcNow;
            _published1 = await AddQuestionAsync(db, lesson.Id, _teacher, now.AddHours(-2), false, null);
            _published2 = await AddQuestionAsync(db, lesson.Id, _teacher, now.AddHours(-1), false, null);
            _hidden = await AddQuestionAsync(db, lesson.Id, _teacher, now.AddHours(-3), true, null);
            _scheduled = await AddQuestionAsync(db, lesson.Id, _teacher, null, false, DateOnly.FromDateTime(now.AddDays(2)));
            _otherPublished = await AddQuestionAsync(db, lesson.Id, _otherTeacher, now.AddHours(-1), false, null);
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

    private static async Task<int> AddQuestionAsync(AppDbContext db, int lessonId, int author, DateTime? publishedAt, bool hidden, DateOnly? scheduledFor)
    {
        var question = new Question
        {
            AuthorUserId = author,
            LessonId = lessonId,
            Source = QuestionSource.Teacher,
            Text = "Soru",
            CorrectOption = 1,
            PublishedAt = publishedAt,
            IsHidden = hidden,
            ScheduledPublishDate = scheduledFor,
            CreatedAt = DateTime.UtcNow
        };
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        return question.Id;
    }

    private async Task<ServiceResult<QuestionPoolListView>> ListAsync(Actor actor, int? authorId, bool includeHidden = false, bool scheduled = false)
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(TestDatabase.ConnectionString(_database)).Options);
        var service = new QuestionPoolService(db, new UserLookupService(db), new EmptyFileUrls(), new TurkeyTime(TimeProvider.System));
        return await service.ListAsync(actor, new QuestionPoolQuery(null, null, null, null, null, includeHidden, scheduled, 1, 50, authorId));
    }

    [Fact]
    public async Task Author_filter_restricts_the_pool_to_that_author()
    {
        if (!_available)
        {
            return;
        }

        var result = (await ListAsync(new Actor(_otherTeacher, Roles.Ogretmen), _teacher)).Value!;

        Assert.Equal([_published2, _published1], result.Items.Select(i => i.Id).ToList());
        Assert.DoesNotContain(result.Items, i => i.Id == _otherPublished);
    }

    [Fact]
    public async Task Author_filter_combines_with_include_hidden_and_scheduled()
    {
        if (!_available)
        {
            return;
        }

        var teacher = new Actor(_otherTeacher, Roles.Ogretmen);

        var withHidden = (await ListAsync(teacher, _teacher, includeHidden: true)).Value!;
        var scheduled = (await ListAsync(teacher, _teacher, scheduled: true)).Value!;

        Assert.Equal(3, withHidden.TotalCount);
        Assert.Contains(withHidden.Items, i => i.Id == _hidden);
        Assert.Equal([_scheduled], scheduled.Items.Select(i => i.Id).ToList());
    }

    [Fact]
    public async Task Without_the_filter_all_authors_are_returned()
    {
        if (!_available)
        {
            return;
        }

        var result = (await ListAsync(new Actor(_teacher, Roles.Ogretmen), null)).Value!;

        Assert.Equal(3, result.TotalCount);
    }

    [Fact]
    public async Task Students_and_non_positive_values_are_rejected()
    {
        if (!_available)
        {
            return;
        }

        var student = await ListAsync(new Actor(_student, Roles.Ogrenci), _teacher);
        var zero = await ListAsync(new Actor(_teacher, Roles.Ogretmen), 0);

        Assert.False(student.Succeeded);
        Assert.False(zero.Succeeded);
    }
}
