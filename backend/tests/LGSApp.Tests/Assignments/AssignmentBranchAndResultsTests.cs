using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Assignments;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Notifications;
using LGSApp.Infrastructure.Services.Points;
using LGSApp.Infrastructure.Services.Questions;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace LGSApp.Tests.Assignments;

public sealed class AssignmentBranchAndResultsTests : IAsyncLifetime
{
    private readonly string _database = TestDatabase.NewName();
    private readonly TurkeyTime _clock = new(TimeProvider.System);
    private bool _available;
    private int _lessonA;
    private int _lessonB;
    private int _teacherA;
    private int _teacherB;
    private int _teacherNone;
    private int _mudur;
    private readonly List<int> _students = [];

    private AppDbContext NewDb() => TestDatabase.Open(_database);

    private Actor TeacherA => new(_teacherA, Roles.Ogretmen);
    private Actor TeacherB => new(_teacherB, Roles.Ogretmen);
    private Actor TeacherNone => new(_teacherNone, Roles.Ogretmen);
    private Actor Mudur => new(_mudur, Roles.Mudur);
    private Actor StudentActor => new(_students[0], Roles.Ogrenci);

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

            _teacherA = await AddUserAsync(db, "ogretmenA", "Ayse", "Aksu", Roles.OgretmenId, _lessonA);
            _teacherB = await AddUserAsync(db, "ogretmenB", "Burak", "Bal", Roles.OgretmenId, _lessonB);
            _teacherNone = await AddUserAsync(db, "ogretmenC", "Cem", "Can", Roles.OgretmenId, null);
            _mudur = await AddUserAsync(db, "mudur1", "Mudur", "Bir", Roles.MudurId, null);
            _students.Add(await AddUserAsync(db, "z_ogr", "Ali", "Yilmaz", Roles.OgrenciId, null));
            _students.Add(await AddUserAsync(db, "y_ogr", "Can", "Demir", Roles.OgrenciId, null));
            _students.Add(await AddUserAsync(db, "x_ogr", "Zeynep", "Kaya", Roles.OgrenciId, null));
            _students.Add(await AddUserAsync(db, "b_ogr", "Deniz", "Ak", Roles.OgrenciId, null));
            _students.Add(await AddUserAsync(db, "a_ogr", "Deniz", "Ak", Roles.OgrenciId, null));
        });
    }

    public async Task DisposeAsync()
    {
        if (_available)
        {
            await TestDatabase.DropAsync(_database);
        }
    }

    private static async Task<int> AddUserAsync(AppDbContext db, string userName, string first, string last, int roleId, int? branch)
    {
        var user = new ApplicationUser
        {
            UserName = userName,
            NormalizedUserName = userName.ToUpperInvariant(),
            SecurityStamp = Guid.NewGuid().ToString(),
            FirstName = first,
            LastName = last,
            BranchLessonId = branch
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        db.UserRoles.Add(new IdentityUserRole<int> { UserId = user.Id, RoleId = roleId });
        await db.SaveChangesAsync();
        return user.Id;
    }

    private SettingsService NewSettings(AppDbContext db) => new(db, new MemoryCache(new MemoryCacheOptions()));

    private AssignmentManagementService NewManagement(AppDbContext db) =>
        new(db, new UserLookupService(db), new AssignmentNotifier(db, _clock), new StubFileUrls(), _clock);

    private AnswerKeyService NewAnswerKeys(AppDbContext db) =>
        new(db, NewSettings(db), new NotificationService(db, _clock), _clock);

    private AssignmentQuestionService NewQuestions(AppDbContext db) =>
        new(db, _clock, new StoredFileValidator(db), NewAnswerKeys(db));

    private QuestionAuthoringService NewAuthoring(AppDbContext db) =>
        new(db, NewSettings(db), new StoredFileValidator(db), new PointService(db, _clock), new StubQuestionService(), new StubFileUrls(), _clock);

    private async Task<int> AddAssignmentAsync(AppDbContext db, int teacherId, int lessonId, bool closed = false)
    {
        var today = _clock.Today;
        var assignment = new Assignment
        {
            TeacherUserId = teacherId,
            LessonId = lessonId,
            Title = "Odev",
            StartDate = closed ? today.AddDays(-5) : today.AddDays(3),
            EndDate = closed ? today.AddDays(-1) : today.AddDays(10),
            Status = closed ? AssignmentStatus.Published : AssignmentStatus.Draft,
            CreatedAt = DateTime.UtcNow
        };
        db.Assignments.Add(assignment);
        await db.SaveChangesAsync();
        return assignment.Id;
    }

    private async Task<int> AddOpenAssignmentAsync(AppDbContext db, int teacherId, int lessonId)
    {
        var today = _clock.Today;
        var assignment = new Assignment
        {
            TeacherUserId = teacherId,
            LessonId = lessonId,
            Title = "Acik",
            StartDate = today.AddDays(-1),
            EndDate = today.AddDays(5),
            Status = AssignmentStatus.Published,
            PublishedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };
        db.Assignments.Add(assignment);
        await db.SaveChangesAsync();
        return assignment.Id;
    }

    private async Task<int> AddQuestionAsync(AppDbContext db, int lessonId, int authorId, byte correct = 1, QuestionSource source = QuestionSource.Teacher, bool hidden = false, int? imageId = null)
    {
        var question = new Question
        {
            AuthorUserId = authorId,
            LessonId = lessonId,
            Source = source,
            Text = "Soru",
            CorrectOption = correct,
            IsHidden = hidden,
            ImageFileId = imageId,
            CreatedAt = DateTime.UtcNow
        };
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        return question.Id;
    }

    private static async Task LinkAsync(AppDbContext db, int assignmentId, int questionId, int order, bool createdFor)
    {
        db.AssignmentQuestions.Add(new AssignmentQuestion { AssignmentId = assignmentId, QuestionId = questionId, OrderNo = order, CreatedForAssignment = createdFor });
        await db.SaveChangesAsync();
    }

    private async Task<int> AddFileAsync(AppDbContext db, int uploaderId)
    {
        var file = new StoredFile
        {
            Container = "c",
            BlobName = Guid.NewGuid().ToString("N"),
            ContentType = "image/jpeg",
            SizeBytes = 10,
            Purpose = FilePurpose.AssignmentImage,
            Status = FileStatus.Ready,
            Width = 10,
            Height = 10,
            ConfirmedAt = DateTime.UtcNow,
            UploadedByUserId = uploaderId
        };
        db.StoredFiles.Add(file);
        await db.SaveChangesAsync();
        return file.Id;
    }

    private static NewAssignmentQuestion ImageItem(int imageId) =>
        new(null, imageId, null, null, null, null, 2, null, null);

    private static NewAssignmentQuestion TextItem(string text) =>
        new(text, null, null, null, null, null, 1, null, null);

    private static CreateAssignmentCommand NewCommand(int lessonId) =>
        new(lessonId, "Baslik", null, DateOnly.FromDateTime(DateTime.UtcNow).AddDays(30), DateOnly.FromDateTime(DateTime.UtcNow).AddDays(35));

    [Fact]
    public async Task Create_assignment_is_limited_to_the_teachers_branch()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewManagement(db);

        var none = await service.CreateAsync(TeacherNone, NewCommand(_lessonA));
        var wrong = await service.CreateAsync(TeacherA, NewCommand(_lessonB));
        var own = await service.CreateAsync(TeacherA, NewCommand(_lessonA));
        var mudur = await service.CreateAsync(Mudur, NewCommand(_lessonB));

        Assert.Equal(ServiceErrorKind.Forbidden, none.Error);
        Assert.Equal(AnswerKeyScope.NoBranchMessage, none.Message);
        Assert.Equal(ServiceErrorKind.Forbidden, wrong.Error);
        Assert.Equal(AnswerKeyScope.WrongBranchMessage, wrong.Message);
        Assert.True(own.Succeeded);
        Assert.True(mudur.Succeeded);
        Assert.Equal(2, await db.Assignments.CountAsync());
    }

    [Fact]
    public async Task Add_questions_requires_the_branch_of_the_assignment_lesson()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewQuestions(db);
        var noBranchOwned = await AddAssignmentAsync(db, _teacherNone, _lessonA);
        var movedOwned = await AddAssignmentAsync(db, _teacherB, _lessonA);
        var ownAssignment = await AddAssignmentAsync(db, _teacherA, _lessonA);

        var none = await service.AddAsync(TeacherNone, noBranchOwned, [TextItem("a")]);
        var wrong = await service.AddAsync(TeacherB, movedOwned, [TextItem("a")]);
        var own = await service.AddAsync(TeacherA, ownAssignment, [TextItem("a")]);
        var mudur = await service.AddAsync(Mudur, noBranchOwned, [TextItem("a")]);

        Assert.Equal(ServiceErrorKind.Forbidden, none.Error);
        Assert.Equal(AnswerKeyScope.NoBranchMessage, none.Message);
        Assert.Equal(ServiceErrorKind.Forbidden, wrong.Error);
        Assert.Equal(AnswerKeyScope.WrongBranchMessage, wrong.Message);
        Assert.True(own.Succeeded);
        Assert.True(mudur.Succeeded);
        Assert.Equal(0, await db.AssignmentQuestions.CountAsync(aq => aq.AssignmentId == movedOwned));
    }

    [Fact]
    public async Task Attach_questions_requires_the_branch_of_the_assignment_lesson()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewQuestions(db);
        var noBranchOwned = await AddAssignmentAsync(db, _teacherNone, _lessonA);
        var movedOwned = await AddAssignmentAsync(db, _teacherB, _lessonA);
        var ownAssignment = await AddAssignmentAsync(db, _teacherA, _lessonA);
        var q1 = await AddQuestionAsync(db, _lessonA, _teacherA);
        var q2 = await AddQuestionAsync(db, _lessonA, _teacherA);

        var none = await service.AttachAsync(TeacherNone, noBranchOwned, [q1]);
        var wrong = await service.AttachAsync(TeacherB, movedOwned, [q1]);
        var own = await service.AttachAsync(TeacherA, ownAssignment, [q1]);
        var mudur = await service.AttachAsync(Mudur, noBranchOwned, [q2]);
        var otherLesson = await service.AttachAsync(TeacherA, ownAssignment, [await AddQuestionAsync(db, _lessonB, _teacherA)]);

        Assert.Equal(AnswerKeyScope.NoBranchMessage, none.Message);
        Assert.Equal(ServiceErrorKind.Forbidden, none.Error);
        Assert.Equal(AnswerKeyScope.WrongBranchMessage, wrong.Message);
        Assert.Equal(ServiceErrorKind.Forbidden, wrong.Error);
        Assert.True(own.Succeeded);
        Assert.True(mudur.Succeeded);
        Assert.Equal(ServiceErrorKind.Validation, otherLesson.Error);
    }

    [Fact]
    public async Task Pool_question_creation_requires_branch_for_teachers_but_not_for_mudur_or_students()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewAuthoring(db);
        await SetAsync(db, SettingKeys.GunlukSoruYuklemeLimiti, "5");
        await SetAsync(db, SettingKeys.AciklamaMinKarakter, "10");

        CreateQuestionCommand Text(int lesson) => new(lesson, null, "Soru metni", null, null, null, null, null, 1, null, null);

        var none = await service.CreateAsync(TeacherNone, Text(_lessonA));
        var wrong = await service.CreateAsync(TeacherA, Text(_lessonB));
        var own = await service.CreateAsync(TeacherA, Text(_lessonA));
        var mudur = await service.CreateAsync(Mudur, Text(_lessonB));
        var imageId = await AddQuestionFileAsync(db, _students[0]);
        var student = await service.CreateAsync(StudentActor, new CreateQuestionCommand(_lessonB, null, null, imageId, null, null, null, null, 2, new string('a', 40), null));

        Assert.Equal(AnswerKeyScope.NoBranchMessage, none.Message);
        Assert.Equal(ServiceErrorKind.Forbidden, none.Error);
        Assert.Equal(AnswerKeyScope.WrongBranchMessage, wrong.Message);
        Assert.Equal(ServiceErrorKind.Forbidden, wrong.Error);
        Assert.True(own.Succeeded);
        Assert.True(mudur.Succeeded);
        Assert.True(student.Succeeded);
    }

    private async Task<int> AddQuestionFileAsync(AppDbContext db, int uploaderId)
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
            UploadedByUserId = uploaderId
        };
        db.StoredFiles.Add(file);
        await db.SaveChangesAsync();
        return file.Id;
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

    [Fact]
    public async Task Changing_the_key_of_a_pooled_question_requires_branch_and_goes_through_the_answer_key_service()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewQuestions(db);
        var assignmentId = await AddAssignmentAsync(db, _teacherNone, _lessonA);
        var questionId = await AddQuestionAsync(db, _lessonA, _teacherA, correct: 1);
        await LinkAsync(db, assignmentId, questionId, 1, false);
        var version = await db.Questions.AsNoTracking().Where(q => q.Id == questionId).Select(q => q.RowVersion).SingleAsync();

        UpdateAssignmentQuestionCommand Change() => new(null, null, null, null, null, null, 3, null, null, version);

        var none = await service.UpdateAsync(TeacherNone, assignmentId, questionId, Change());
        await using var db2 = NewDb();
        var wrongAssignment = await AddAssignmentAsync(db2, _teacherB, _lessonA);
        var wrongQuestion = await AddQuestionAsync(db2, _lessonA, _teacherA, correct: 1);
        await LinkAsync(db2, wrongAssignment, wrongQuestion, 1, false);
        var wrongVersion = await db2.Questions.AsNoTracking().Where(q => q.Id == wrongQuestion).Select(q => q.RowVersion).SingleAsync();
        var wrong = await NewQuestions(db2).UpdateAsync(TeacherB, wrongAssignment, wrongQuestion, new UpdateAssignmentQuestionCommand(null, null, null, null, null, null, 3, null, null, wrongVersion));

        Assert.Equal(ServiceErrorKind.Forbidden, none.Error);
        Assert.Equal(AnswerKeyScope.NoBranchMessage, none.Message);
        Assert.Equal(ServiceErrorKind.Forbidden, wrong.Error);
        Assert.Equal(AnswerKeyScope.WrongBranchMessage, wrong.Message);

        await using var db3 = NewDb();
        var ownAssignment = await AddAssignmentAsync(db3, _teacherA, _lessonA);
        var ownQuestion = await AddQuestionAsync(db3, _lessonA, _teacherA, correct: 1);
        await LinkAsync(db3, ownAssignment, ownQuestion, 1, false);
        var ownVersion = await db3.Questions.AsNoTracking().Where(q => q.Id == ownQuestion).Select(q => q.RowVersion).SingleAsync();
        var own = await NewQuestions(db3).UpdateAsync(TeacherA, ownAssignment, ownQuestion, new UpdateAssignmentQuestionCommand(null, null, null, null, null, null, 3, null, null, ownVersion));

        Assert.True(own.Succeeded);
        await using var check = NewDb();
        var row = await check.Questions.AsNoTracking().SingleAsync(q => q.Id == ownQuestion);
        Assert.Equal(3, row.CorrectOption);
        Assert.NotNull(row.CorrectOptionChangedAt);
        Assert.Equal(_teacherA, row.CorrectOptionChangedByUserId);
        Assert.NotNull(row.AnswerKeyReviewedAt);
        Assert.True(row.RowVersion.AsSpan().SequenceEqual(own.Value!.RowVersion));
    }

    [Fact]
    public async Task Mudur_can_change_the_key_of_a_pooled_question_and_assignment_made_questions_stay_free()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewQuestions(db);
        var assignmentId = await AddAssignmentAsync(db, _teacherA, _lessonA);
        var pooled = await AddQuestionAsync(db, _lessonA, _teacherA, correct: 1);
        var made = await AddQuestionAsync(db, _lessonA, _teacherA, correct: 1, source: QuestionSource.Teacher);
        await LinkAsync(db, assignmentId, pooled, 1, false);
        await LinkAsync(db, assignmentId, made, 2, true);
        var pooledVersion = await db.Questions.AsNoTracking().Where(q => q.Id == pooled).Select(q => q.RowVersion).SingleAsync();
        var madeVersion = await db.Questions.AsNoTracking().Where(q => q.Id == made).Select(q => q.RowVersion).SingleAsync();

        var byMudur = await service.UpdateAsync(Mudur, assignmentId, pooled, new UpdateAssignmentQuestionCommand(null, null, null, null, null, null, 4, null, null, pooledVersion));
        var madeResult = await service.UpdateAsync(TeacherA, assignmentId, made, new UpdateAssignmentQuestionCommand(null, null, null, null, null, null, 2, null, null, madeVersion));

        Assert.True(byMudur.Succeeded);
        Assert.True(madeResult.Succeeded);
        await using var check = NewDb();
        var pooledRow = await check.Questions.AsNoTracking().SingleAsync(q => q.Id == pooled);
        var madeRow = await check.Questions.AsNoTracking().SingleAsync(q => q.Id == made);
        Assert.Equal(4, pooledRow.CorrectOption);
        Assert.Equal(_mudur, pooledRow.CorrectOptionChangedByUserId);
        Assert.Equal(2, madeRow.CorrectOption);
        Assert.Null(madeRow.CorrectOptionChangedAt);
    }

    [Fact]
    public async Task Adding_the_same_image_again_returns_the_existing_question()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewQuestions(db);
        var assignmentId = await AddAssignmentAsync(db, _teacherA, _lessonA);
        var imageId = await AddFileAsync(db, _teacherA);

        var first = await service.AddAsync(TeacherA, assignmentId, [ImageItem(imageId)]);
        var second = await service.AddAsync(TeacherA, assignmentId, [ImageItem(imageId)]);

        Assert.True(first.Succeeded);
        Assert.True(second.Succeeded);
        Assert.Equal(first.Value!.Items[0].Id, second.Value!.Items[0].Id);
        Assert.Equal(first.Value.Items[0].OrderNo, second.Value.Items[0].OrderNo);
        Assert.Equal(1, second.Value.TotalCount);
        Assert.Equal(1, await db.AssignmentQuestions.CountAsync(aq => aq.AssignmentId == assignmentId));
        Assert.Equal(1, await db.Questions.CountAsync(q => q.ImageFileId == imageId));
    }

    [Fact]
    public async Task Mixed_batch_replays_known_images_and_creates_only_the_new_items_in_request_order()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewQuestions(db);
        var assignmentId = await AddAssignmentAsync(db, _teacherA, _lessonA);
        var imageId = await AddFileAsync(db, _teacherA);
        var first = await service.AddAsync(TeacherA, assignmentId, [ImageItem(imageId)]);

        var batch = await service.AddAsync(TeacherA, assignmentId, [TextItem("yeni"), ImageItem(imageId)]);

        Assert.True(batch.Succeeded);
        Assert.Equal(2, batch.Value!.Items.Count);
        Assert.Equal(first.Value!.Items[0].Id, batch.Value.Items[1].Id);
        Assert.NotEqual(first.Value.Items[0].Id, batch.Value.Items[0].Id);
        Assert.Equal(2, batch.Value.TotalCount);
        Assert.Equal(2, await db.AssignmentQuestions.CountAsync(aq => aq.AssignmentId == assignmentId));
    }

    [Fact]
    public async Task Image_used_by_another_assignment_is_still_rejected()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var service = NewQuestions(db);
        var firstAssignment = await AddAssignmentAsync(db, _teacherA, _lessonA);
        var secondAssignment = await AddAssignmentAsync(db, _teacherA, _lessonA);
        var imageId = await AddFileAsync(db, _teacherA);

        await service.AddAsync(TeacherA, firstAssignment, [ImageItem(imageId)]);
        var other = await service.AddAsync(TeacherA, secondAssignment, [ImageItem(imageId)]);

        Assert.False(other.Succeeded);
        Assert.Equal(0, await db.AssignmentQuestions.CountAsync(aq => aq.AssignmentId == secondAssignment));
    }

    private async Task<int> SeedResultsAsync(AppDbContext db, bool closed)
    {
        var assignmentId = closed
            ? await AddAssignmentAsync(db, _teacherA, _lessonA, closed: true)
            : await AddOpenAssignmentAsync(db, _teacherA, _lessonA);
        var q1 = await AddQuestionAsync(db, _lessonA, _teacherA);
        var q2 = await AddQuestionAsync(db, _lessonA, _teacherA);
        var hidden = await AddQuestionAsync(db, _lessonA, _teacherA, hidden: true);
        await LinkAsync(db, assignmentId, q1, 1, false);
        await LinkAsync(db, assignmentId, q2, 2, false);
        await LinkAsync(db, assignmentId, hidden, 3, false);

        void Answer(int user, int question) => db.Answers.Add(new Answer { QuestionId = question, UserId = user, AssignmentId = assignmentId, SelectedOption = 1, IsCorrect = true, AnsweredAt = DateTime.UtcNow });
        Answer(_students[0], q1);
        Answer(_students[0], q2);
        Answer(_students[1], q1);
        Answer(_students[2], hidden);
        await db.SaveChangesAsync();
        return assignmentId;
    }

    [Fact]
    public async Task Participation_counts_cover_all_students_regardless_of_the_page()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var assignmentId = await SeedResultsAsync(db, closed: false);
        var service = NewManagement(db);

        var page1 = await service.ResultsAsync(TeacherA, assignmentId, new AssignmentResultsQuery(AssignmentResultSort.Name, false, 1, 2));
        var page3 = await service.ResultsAsync(TeacherA, assignmentId, new AssignmentResultsQuery(AssignmentResultSort.Name, false, 3, 2));

        foreach (var view in new[] { page1.Value!, page3.Value! })
        {
            Assert.Equal(5, view.TotalStudents);
            Assert.Equal(1, view.CompletedCount);
            Assert.Equal(1, view.PartialCount);
            Assert.Equal(0, view.MissedCount);
            Assert.Equal(3, view.NotStartedCount);
        }

        Assert.Equal(2, page1.Value!.Students.Count);
        Assert.Single(page3.Value!.Students);
    }

    [Fact]
    public async Task Closed_assignment_counts_unstarted_students_as_missed()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var assignmentId = await SeedResultsAsync(db, closed: true);

        var result = await NewManagement(db).ResultsAsync(Mudur, assignmentId, new AssignmentResultsQuery(AssignmentResultSort.Completion, true, 1, 1));

        Assert.Equal(1, result.Value!.CompletedCount);
        Assert.Equal(1, result.Value.PartialCount);
        Assert.Equal(3, result.Value.MissedCount);
        Assert.Equal(0, result.Value.NotStartedCount);
        Assert.Equal(2, result.Value.TotalQuestions);
    }

    [Fact]
    public async Task Name_sort_uses_the_displayed_full_name_and_breaks_ties_by_id()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var assignmentId = await SeedResultsAsync(db, closed: false);
        var service = NewManagement(db);

        var asc = await service.ResultsAsync(TeacherA, assignmentId, new AssignmentResultsQuery(AssignmentResultSort.Name, false, 1, 50));
        var desc = await service.ResultsAsync(TeacherA, assignmentId, new AssignmentResultsQuery(AssignmentResultSort.Name, true, 1, 50));

        Assert.Equal(new string?[] { "Ali Yilmaz", "Can Demir", "Deniz Ak", "Deniz Ak", "Zeynep Kaya" }, asc.Value!.Students.Select(s => s.FullName).ToArray());
        Assert.Equal([_students[3], _students[4]], asc.Value.Students.Where(s => s.FullName == "Deniz Ak").Select(s => s.UserId).ToArray());
        Assert.Equal("Zeynep Kaya", desc.Value!.Students[0].FullName);
        Assert.Equal([_students[3], _students[4]], desc.Value.Students.Where(s => s.FullName == "Deniz Ak").Select(s => s.UserId).ToArray());
    }

    private sealed class StubQuestionService : IQuestionService
    {
        public Task<ServiceResult<QuestionDetailView>> GetDetailAsync(Actor actor, int questionId, CancellationToken cancellationToken = default) =>
            Task.FromResult(ServiceResult<QuestionDetailView>.Ok(new QuestionDetailView(
                questionId, QuestionSource.Student, new LessonRefView(1, "x"), null, null, null, null, null,
                new QuestionOptionsView(null, null, null, null), null, DateTime.UtcNow, null, null, null, null, null, null,
                new QuestionPermissionsView(false, false, false, false, false, false, false, false), null, false, null, "none", null, null, null, false, null)));
    }

    private sealed class StubFileUrls : IFileUrlService
    {
        public Task<IReadOnlyDictionary<int, ImageView>> GetAsync(IEnumerable<int?> fileIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyDictionary<int, ImageView>>(new Dictionary<int, ImageView>());
    }
}
