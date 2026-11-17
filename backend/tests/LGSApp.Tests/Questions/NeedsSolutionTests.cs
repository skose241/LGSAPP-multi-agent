using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Questions;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace LGSApp.Tests.Questions;

public sealed class NeedsSolutionTests : IAsyncLifetime
{
    private readonly string _database = TestDatabase.NewName();
    private bool _available;
    private int _lessonA;
    private int _lessonB;
    private int _teacherA;
    private int _teacherB;
    private int _teacherNone;
    private int _mudur;
    private int _studentActor;
    private readonly List<int> _students = [];

    private AppDbContext NewDb() => TestDatabase.Open(_database);

    private NeedsSolutionService NewService(AppDbContext db) =>
        new(db, new SettingsService(db, new MemoryCache(new MemoryCacheOptions())), new StubFileUrls());

    private Actor TeacherA => new(_teacherA, Roles.Ogretmen);
    private Actor TeacherB => new(_teacherB, Roles.Ogretmen);
    private Actor TeacherNone => new(_teacherNone, Roles.Ogretmen);
    private Actor Mudur => new(_mudur, Roles.Mudur);
    private Actor Student => new(_studentActor, Roles.Ogrenci);

    public async Task InitializeAsync()
    {
        _available = await TestDatabase.TryCreateAsync(_database, async db =>
        {
            var a = new Lesson { Name = "Matematik", Session = LessonSession.Sayisal, OrderNo = 1, IsActive = true };
            var b = new Lesson { Name = "Fen", Session = LessonSession.Sayisal, OrderNo = 2, IsActive = true };
            db.Lessons.AddRange(a, b);
            await db.SaveChangesAsync();
            _lessonA = a.Id;
            _lessonB = b.Id;

            _teacherA = await AddUserAsync(db, "ogretmenA", Roles.OgretmenId, _lessonA);
            _teacherB = await AddUserAsync(db, "ogretmenB", Roles.OgretmenId, _lessonB);
            _teacherNone = await AddUserAsync(db, "ogretmenC", Roles.OgretmenId, null);
            _mudur = await AddUserAsync(db, "mudur1", Roles.MudurId, null);
            for (var i = 0; i < 12; i++)
            {
                _students.Add(await AddUserAsync(db, "ogrenci" + i, Roles.OgrenciId, null));
            }

            _studentActor = _students[0];
        });
    }

    public async Task DisposeAsync()
    {
        if (_available)
        {
            await TestDatabase.DropAsync(_database);
        }
    }

    private static async Task<int> AddUserAsync(AppDbContext db, string name, int roleId, int? branch)
    {
        var user = new ApplicationUser
        {
            UserName = name,
            NormalizedUserName = name.ToUpperInvariant(),
            SecurityStamp = Guid.NewGuid().ToString(),
            FirstName = name,
            LastName = "T",
            BranchLessonId = branch
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        db.UserRoles.Add(new IdentityUserRole<int> { UserId = user.Id, RoleId = roleId });
        await db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<int> AddQuestionAsync(AppDbContext db, int lessonId, int total, int wrong, Action<Question>? configure = null)
    {
        var question = new Question
        {
            AuthorUserId = _students[11],
            LessonId = lessonId,
            Source = QuestionSource.Student,
            Text = "Soru metni",
            CorrectOption = 1,
            PublishedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };
        configure?.Invoke(question);
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        for (var i = 0; i < total; i++)
        {
            var isWrong = i < wrong;
            db.Answers.Add(new Answer
            {
                QuestionId = question.Id,
                UserId = _students[i],
                SelectedOption = (byte)(isWrong ? 2 : 1),
                IsCorrect = !isWrong,
                AnsweredAt = DateTime.UtcNow
            });
        }

        await db.SaveChangesAsync();
        return question.Id;
    }

    private static async Task SetSettingAsync(AppDbContext db, string key, int value)
    {
        await db.Settings.Where(s => s.Key == key).ExecuteUpdateAsync(s => s.SetProperty(x => x.Value, value.ToString()));
    }

    private static NeedsSolutionQuery Query(int? lessonId = null, int page = 1, int pageSize = 20) => new(lessonId, page, pageSize);

    [Fact]
    public async Task Student_is_forbidden_and_moderators_get_a_list()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewService(db);

        Assert.Equal(ServiceErrorKind.Forbidden, (await service.ListAsync(Student, Query())).Error);
        Assert.Equal(ServiceErrorKind.Forbidden, (await service.SetNotNeededAsync(Student, 1, true)).Error);
        Assert.True((await service.ListAsync(TeacherA, Query())).Succeeded);
        Assert.True((await service.ListAsync(Mudur, Query())).Succeeded);
    }

    [Fact]
    public async Task Thresholds_are_inclusive_and_reported_in_the_header()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var exact = await AddQuestionAsync(db, _lessonA, 5, 3);
        var tenExact = await AddQuestionAsync(db, _lessonA, 10, 6);
        var belowRate = await AddQuestionAsync(db, _lessonA, 5, 2);
        var belowRateLarge = await AddQuestionAsync(db, _lessonA, 7, 4);
        var belowCount = await AddQuestionAsync(db, _lessonA, 4, 4);
        var noAnswers = await AddQuestionAsync(db, _lessonA, 0, 0);

        var view = (await NewService(db).ListAsync(Mudur, Query())).Value!;

        Assert.Equal(5, view.ThresholdAnswers);
        Assert.Equal(60, view.ThresholdWrongRate);
        Assert.Equal(2, view.TotalCount);
        var ids = view.Items.Select(i => i.Id).ToList();
        Assert.Contains(exact, ids);
        Assert.Contains(tenExact, ids);
        Assert.DoesNotContain(belowRate, ids);
        Assert.DoesNotContain(belowRateLarge, ids);
        Assert.DoesNotContain(belowCount, ids);
        Assert.DoesNotContain(noAnswers, ids);
        var item = view.Items.Single(i => i.Id == exact);
        Assert.Equal(5, item.TotalAnswers);
        Assert.Equal(3, item.WrongAnswers);
        Assert.Equal(60.0, item.WrongRate);
        Assert.Equal("Matematik", item.Lesson.Name);
        Assert.Equal("Soru metni", item.PreviewText);
        Assert.Equal((byte)1, item.CorrectOption);
        Assert.False(item.IsAnswerDisputed);
        Assert.NotNull(item.PublishedAt);
    }

    [Fact]
    public async Task Thresholds_follow_the_settings()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var q = await AddQuestionAsync(db, _lessonA, 3, 1);
        await SetSettingAsync(db, SettingKeys.CozumEsikCevapSayisi, 3);
        await SetSettingAsync(db, SettingKeys.CozumEsikYanlisOrani, 34);

        var miss = (await NewService(db).ListAsync(Mudur, Query())).Value!;
        Assert.Empty(miss.Items);
        Assert.Equal(3, miss.ThresholdAnswers);
        Assert.Equal(34, miss.ThresholdWrongRate);

        await SetSettingAsync(db, SettingKeys.CozumEsikYanlisOrani, 33);
        var hit = (await NewService(db).ListAsync(Mudur, Query())).Value!;
        Assert.Equal([q], hit.Items.Select(i => i.Id).ToList());
    }

    [Fact]
    public async Task Excluded_questions_do_not_show_up()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var included = await AddQuestionAsync(db, _lessonA, 5, 5);
        var hidden = await AddQuestionAsync(db, _lessonA, 5, 5, q => q.IsHidden = true);
        var draft = await AddQuestionAsync(db, _lessonA, 5, 5, q => q.PublishedAt = null);
        var notNeeded = await AddQuestionAsync(db, _lessonA, 5, 5, q => q.SolutionNotNeeded = true);
        var withTeacher = await AddQuestionAsync(db, _lessonA, 5, 5);
        var deletedTeacher = await AddQuestionAsync(db, _lessonA, 5, 5);
        var aiAndStudent = await AddQuestionAsync(db, _lessonA, 5, 5);
        var studentAnswerId = await db.Answers.Where(a => a.QuestionId == aiAndStudent && a.UserId == _students[1]).Select(a => a.Id).SingleAsync();
        db.Solutions.AddRange(
            new Solution { QuestionId = withTeacher, AuthorUserId = _teacherA, Type = SolutionType.Teacher, Text = "Ã‡Ã¶zÃ¼m" },
            new Solution { QuestionId = deletedTeacher, AuthorUserId = _teacherA, Type = SolutionType.Teacher, Text = "Ã‡Ã¶zÃ¼m", IsDeleted = true },
            new Solution { QuestionId = aiAndStudent, AuthorUserId = _students[1], Type = SolutionType.Student, AnswerId = studentAnswerId, Text = "Ã‡Ã¶zÃ¼m" },
            new Solution { QuestionId = aiAndStudent, AuthorUserId = _students[2], Type = SolutionType.Ai, Text = "Ã‡Ã¶zÃ¼m" });
        await db.SaveChangesAsync();

        var ids = (await NewService(db).ListAsync(Mudur, Query())).Value!.Items.Select(i => i.Id).ToHashSet();

        Assert.Equal(new HashSet<int> { included, deletedTeacher, aiAndStudent }, ids);
    }

    [Fact]
    public async Task Order_is_wrong_rate_then_total_then_id()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var rate60 = await AddQuestionAsync(db, _lessonA, 5, 3);
        var rate100Small = await AddQuestionAsync(db, _lessonA, 5, 5);
        var rate100Large = await AddQuestionAsync(db, _lessonA, 8, 8);
        var rate100LargeSecond = await AddQuestionAsync(db, _lessonB, 8, 8);
        var rate75 = await AddQuestionAsync(db, _lessonA, 8, 6);

        var ids = (await NewService(db).ListAsync(Mudur, Query())).Value!.Items.Select(i => i.Id).ToList();

        Assert.Equal([rate100Large, rate100LargeSecond, rate100Small, rate75, rate60], ids);
    }

    [Fact]
    public async Task Branch_rule_limits_teachers_and_rejects_branchless_teachers()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var inA = await AddQuestionAsync(db, _lessonA, 5, 5);
        var inB = await AddQuestionAsync(db, _lessonB, 5, 5);
        var service = NewService(db);

        Assert.Equal([inA], (await service.ListAsync(TeacherA, Query())).Value!.Items.Select(i => i.Id).ToList());
        Assert.Equal([inB], (await service.ListAsync(TeacherB, Query())).Value!.Items.Select(i => i.Id).ToList());
        Assert.Equal([inA], (await service.ListAsync(TeacherA, Query(_lessonA))).Value!.Items.Select(i => i.Id).ToList());
        Assert.Equal(2, (await service.ListAsync(Mudur, Query())).Value!.TotalCount);
        Assert.Equal([inB], (await service.ListAsync(Mudur, Query(_lessonB))).Value!.Items.Select(i => i.Id).ToList());

        var branchless = await service.ListAsync(TeacherNone, Query());
        Assert.Equal(ServiceErrorKind.Forbidden, branchless.Error);
        Assert.Equal(AnswerKeyScope.NoBranchMessage, branchless.Message);

        var crossed = await service.ListAsync(TeacherA, Query(_lessonB));
        Assert.Equal(ServiceErrorKind.Forbidden, crossed.Error);
        Assert.Equal(AnswerKeyScope.ViewWrongBranchMessage, crossed.Message);
    }

    [Fact]
    public async Task Paging_is_validated_and_applied()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var ids = new List<int>();
        for (var i = 0; i < 5; i++)
        {
            ids.Add(await AddQuestionAsync(db, _lessonA, 5, 5));
        }

        var service = NewService(db);

        var second = (await service.ListAsync(Mudur, Query(null, 2, 2))).Value!;
        Assert.Equal(5, second.TotalCount);
        Assert.Equal(2, second.Page);
        Assert.Equal(2, second.PageSize);
        Assert.Equal([ids[2], ids[3]], second.Items.Select(i => i.Id).ToList());
        Assert.Empty((await service.ListAsync(Mudur, Query(null, 9, 2))).Value!.Items);
        Assert.Equal(ServiceErrorKind.Validation, (await service.ListAsync(Mudur, Query(null, 0, 2))).Error);
        Assert.Equal(ServiceErrorKind.Validation, (await service.ListAsync(Mudur, Query(null, 1, 0))).Error);
        Assert.Equal(ServiceErrorKind.Validation, (await service.ListAsync(Mudur, Query(null, 1, 51))).Error);
        Assert.True((await service.ListAsync(Mudur, Query(null, 1, 50))).Succeeded);
    }

    [Fact]
    public async Task Marking_not_needed_removes_the_question_and_unmarking_restores_it()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var id = await AddQuestionAsync(db, _lessonA, 5, 5);
        var service = NewService(db);

        Assert.True((await service.SetNotNeededAsync(TeacherA, id, true)).Succeeded);
        Assert.True((await service.SetNotNeededAsync(TeacherA, id, true)).Succeeded);
        Assert.Empty((await service.ListAsync(Mudur, Query())).Value!.Items);
        Assert.True(await db.Questions.AsNoTracking().Where(q => q.Id == id).Select(q => q.SolutionNotNeeded).SingleAsync());

        Assert.True((await service.SetNotNeededAsync(Mudur, id, false)).Succeeded);
        Assert.True((await service.SetNotNeededAsync(Mudur, id, false)).Succeeded);
        Assert.Equal([id], (await service.ListAsync(Mudur, Query())).Value!.Items.Select(i => i.Id).ToList());
    }

    [Fact]
    public async Task Marking_follows_the_branch_rule_and_reports_missing_questions()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var id = await AddQuestionAsync(db, _lessonA, 5, 5);
        var service = NewService(db);

        var wrongBranch = await service.SetNotNeededAsync(TeacherB, id, true);
        Assert.Equal(ServiceErrorKind.Forbidden, wrongBranch.Error);
        Assert.Equal(ServiceErrorKind.Forbidden, (await service.SetNotNeededAsync(TeacherB, id, false)).Error);
        Assert.Equal(ServiceErrorKind.NotFound, (await service.SetNotNeededAsync(Mudur, 999999, true)).Error);
        Assert.False(await db.Questions.AsNoTracking().Where(q => q.Id == id).Select(q => q.SolutionNotNeeded).SingleAsync());

        var branchless = await service.SetNotNeededAsync(TeacherNone, id, true);
        Assert.Equal(ServiceErrorKind.Forbidden, branchless.Error);
        Assert.Equal(AnswerKeyScope.NoBranchMessage, branchless.Message);
        Assert.True((await service.SetNotNeededAsync(TeacherA, id, true)).Succeeded);
    }

    [Fact]
    public async Task Stale_tracked_row_version_yields_a_conflict()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var id = await AddQuestionAsync(db, _lessonA, 5, 5);
        var service = NewService(db);
        await db.Questions.FirstAsync(q => q.Id == id);

        await using (var other = NewDb())
        {
            await other.Questions.Where(q => q.Id == id).ExecuteUpdateAsync(s => s.SetProperty(q => q.IsHidden, true));
        }

        var result = await service.SetNotNeededAsync(Mudur, id, true);

        Assert.Equal(ServiceErrorKind.Conflict, result.Error);
    }

    [Fact]
    public async Task Adding_a_teacher_solution_drops_the_question_from_the_list()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var id = await AddQuestionAsync(db, _lessonA, 5, 5);
        var service = NewService(db);
        Assert.Single((await service.ListAsync(Mudur, Query())).Value!.Items);

        db.Solutions.Add(new Solution { QuestionId = id, AuthorUserId = _teacherA, Type = SolutionType.Teacher, Text = "Ã‡Ã¶zÃ¼m" });
        await db.SaveChangesAsync();

        Assert.Empty((await service.ListAsync(Mudur, Query())).Value!.Items);
        Assert.Equal(0, (await service.ListAsync(Mudur, Query())).Value!.TotalCount);
    }

    private sealed class StubFileUrls : IFileUrlService
    {
        public Task<IReadOnlyDictionary<int, ImageView>> GetAsync(IEnumerable<int?> fileIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyDictionary<int, ImageView>>(new Dictionary<int, ImageView>());
    }
}
