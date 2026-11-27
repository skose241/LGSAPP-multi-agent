using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Students;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LGSApp.Tests.Stats;

public sealed class StudentActivityTests : IAsyncLifetime
{
    private readonly string _database = TestDatabase.NewName();
    private bool _available;
    private int _lessonId;
    private int _teacher;
    private int _mudur;
    private int _ali;
    private int _veli;
    private int _upload1;
    private int _upload2;
    private int _veliUpload;
    private int _teacherQuestion;
    private int _teacherQuestion2;
    private int _assignmentId;
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

            _teacher = await AddUserAsync(db, "ogretmen1", Roles.OgretmenId);
            _mudur = await AddUserAsync(db, "mudur1", Roles.MudurId);
            _ali = await AddUserAsync(db, "ali", Roles.OgrenciId);
            _veli = await AddUserAsync(db, "veli", Roles.OgrenciId);

            var now = DateTime.UtcNow;
            _upload1 = await AddQuestionAsync(db, _ali, QuestionSource.Student, now.AddHours(-3), "Takildim 1");
            _upload2 = await AddQuestionAsync(db, _ali, QuestionSource.Student, now.AddHours(-1), "Takildim 2");
            _veliUpload = await AddQuestionAsync(db, _veli, QuestionSource.Student, now.AddHours(-2), "Veli");
            await AddQuestionAsync(db, _ali, QuestionSource.Teacher, now, "Ogretmen sorusu");
            _teacherQuestion = await AddQuestionAsync(db, _teacher, QuestionSource.Teacher, now.AddHours(-5), null);
            _teacherQuestion2 = await AddQuestionAsync(db, _teacher, QuestionSource.Teacher, now.AddHours(-4), null);

            var hidden = await db.Questions.FindAsync(_upload1);
            hidden!.IsHidden = true;
            hidden.PublishedAt = null;

            var assignment = new Assignment
            {
                TeacherUserId = _teacher,
                LessonId = _lessonId,
                Title = "Hafta 1",
                StartDate = DateOnly.FromDateTime(now),
                EndDate = DateOnly.FromDateTime(now.AddDays(3)),
                Status = AssignmentStatus.Published
            };
            db.Assignments.Add(assignment);
            await db.SaveChangesAsync();
            _assignmentId = assignment.Id;
            db.AssignmentQuestions.Add(new AssignmentQuestion { AssignmentId = _assignmentId, QuestionId = _teacherQuestion, OrderNo = 1 });
            await db.SaveChangesAsync();

            var a1 = new Answer { QuestionId = _upload2, UserId = _veli, SelectedOption = 1, IsCorrect = true, AnsweredAt = now.AddHours(-4) };
            var a2 = new Answer { QuestionId = _teacherQuestion, UserId = _ali, SelectedOption = 1, IsCorrect = true, AnsweredAt = now.AddHours(-3), AssignmentId = _assignmentId };
            var a3 = new Answer { QuestionId = _teacherQuestion2, UserId = _ali, SelectedOption = 2, IsCorrect = false, AnsweredAt = now.AddHours(-2) };
            var a4 = new Answer { QuestionId = _veliUpload, UserId = _ali, SelectedOption = 1, IsCorrect = true, AnsweredAt = now.AddHours(-1) };
            db.Answers.AddRange(a1, a2, a3, a4);
            await db.SaveChangesAsync();

            db.Solutions.AddRange(
                new Solution { QuestionId = _teacherQuestion, AuthorUserId = _ali, Type = SolutionType.Student, AnswerId = a2.Id, Text = "Boyle cozdum" },
                new Solution { QuestionId = _teacherQuestion2, AuthorUserId = _ali, Type = SolutionType.Student, AnswerId = a3.Id, Text = "Silinmis", IsDeleted = true },
                new Solution { QuestionId = _upload2, AuthorUserId = _teacher, Type = SolutionType.Teacher, Text = "Ogretmen cozumu" });
            await db.SaveChangesAsync();
        });

        var services = new ServiceCollection();
        services.AddDbContext<AppDbContext>(options => options.UseSqlServer(TestDatabase.ConnectionString(_database)));
        services.AddSingleton<IFileUrlService, EmptyFileUrls>();
        services.AddScoped<IStudentActivityService, StudentActivityService>();
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

    private async Task<int> AddQuestionAsync(AppDbContext db, int author, QuestionSource source, DateTime createdAt, string? description)
    {
        var question = new Question
        {
            AuthorUserId = author,
            LessonId = _lessonId,
            Source = source,
            Text = "Soru",
            Description = description,
            CorrectOption = 1,
            PublishedAt = createdAt,
            CreatedAt = createdAt
        };
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        return question.Id;
    }

    private async Task<T> WithServiceAsync<T>(Func<IStudentActivityService, Task<T>> action)
    {
        await using var scope = _provider.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<IStudentActivityService>());
    }

    private Task<ServiceResult<StudentUploadsView>> UploadsAsync(int id, Actor? actor = null, int page = 1, int pageSize = 20) =>
        WithServiceAsync(s => s.ListUploadsAsync(actor ?? TeacherActor, id, page, pageSize));

    private Task<ServiceResult<StudentAnswersView>> AnswersAsync(int id, Actor? actor = null, int? lessonId = null, int page = 1, int pageSize = 20) =>
        WithServiceAsync(s => s.ListAnswersAsync(actor ?? TeacherActor, id, lessonId, page, pageSize));

    [Fact]
    public async Task Teacher_and_mudur_see_only_student_source_uploads_newest_first_including_hidden()
    {
        if (!_available)
        {
            return;
        }

        var viaTeacher = (await UploadsAsync(_ali)).Value!;
        var viaMudur = (await UploadsAsync(_ali, MudurActor)).Value!;

        Assert.Equal(2, viaTeacher.TotalCount);
        Assert.Equal([_upload2, _upload1], viaTeacher.Items.Select(i => i.Id).ToList());
        Assert.Equal(viaTeacher.Items.Select(i => i.Id), viaMudur.Items.Select(i => i.Id));
        Assert.Equal("Takildim 2", viaTeacher.Items[0].Description);
        Assert.True(viaTeacher.Items[1].IsHidden);
        Assert.Null(viaTeacher.Items[1].PublishedAt);
        Assert.Equal(1, viaTeacher.Items[0].AnswerCount);
        Assert.Equal(1, viaTeacher.Items[0].SolutionCount);
        Assert.Equal("Matematik", viaTeacher.Items[0].Lesson.Name);
    }

    [Fact]
    public async Task Uploads_do_not_leak_other_students_questions()
    {
        if (!_available)
        {
            return;
        }

        var items = (await UploadsAsync(_veli)).Value!.Items;

        Assert.Equal([_veliUpload], items.Select(i => i.Id).ToList());
    }

    [Fact]
    public async Task Uploads_paging_slices_and_validates()
    {
        if (!_available)
        {
            return;
        }

        Assert.Equal([_upload1], (await UploadsAsync(_ali, page: 2, pageSize: 1)).Value!.Items.Select(i => i.Id).ToList());
        Assert.Empty((await UploadsAsync(_ali, page: 9, pageSize: 1)).Value!.Items);
        Assert.Equal(ServiceErrorKind.Validation, (await UploadsAsync(_ali, page: 0)).Error);
        Assert.Equal(ServiceErrorKind.Validation, (await UploadsAsync(_ali, pageSize: 0)).Error);
        Assert.Equal(ServiceErrorKind.Validation, (await UploadsAsync(_ali, pageSize: 51)).Error);
        Assert.True((await UploadsAsync(_ali, pageSize: 50)).Succeeded);
    }

    [Fact]
    public async Task Students_are_forbidden_and_non_students_are_not_found()
    {
        if (!_available)
        {
            return;
        }

        var student = new Actor(_ali, Roles.Ogrenci);

        Assert.Equal(ServiceErrorKind.Forbidden, (await UploadsAsync(_ali, student)).Error);
        Assert.Equal(ServiceErrorKind.Forbidden, (await AnswersAsync(_ali, student)).Error);
        Assert.Equal(ServiceErrorKind.NotFound, (await UploadsAsync(_teacher, MudurActor)).Error);
        Assert.Equal(ServiceErrorKind.NotFound, (await AnswersAsync(_teacher, MudurActor)).Error);
        Assert.Equal(ServiceErrorKind.NotFound, (await AnswersAsync(999999)).Error);
    }

    [Fact]
    public async Task Answers_carry_explanation_assignment_question_and_summary()
    {
        if (!_available)
        {
            return;
        }

        var view = (await AnswersAsync(_ali, MudurActor)).Value!;

        Assert.Equal(3, view.TotalCount);
        Assert.Equal(3, view.Summary.TotalAnswers);
        Assert.Equal(1, view.Summary.WithExplanation);
        Assert.Equal(2, view.Summary.WithoutExplanation);

        var newest = view.Items[0];
        Assert.Equal(_veliUpload, newest.Question.Id);
        Assert.Equal(QuestionSource.Student, newest.Question.Source);
        Assert.Null(newest.Explanation);
        Assert.Null(newest.Assignment);

        var deleted = view.Items[1];
        Assert.Equal(_teacherQuestion2, deleted.Question.Id);
        Assert.False(deleted.IsCorrect);
        Assert.NotNull(deleted.Explanation);
        Assert.True(deleted.Explanation!.IsDeleted);

        var explained = view.Items[2];
        Assert.Equal("Boyle cozdum", explained.Explanation!.Text);
        Assert.False(explained.Explanation.IsDeleted);
        Assert.Equal(_assignmentId, explained.Assignment!.Id);
        Assert.Equal("Hafta 1", explained.Assignment.Title);
        Assert.Equal("Soru", explained.Question.PreviewText);
        Assert.Equal((byte)1, explained.SelectedOption);
    }

    [Fact]
    public async Task Answers_ignore_teacher_solutions_and_other_users_and_filter_by_lesson()
    {
        if (!_available)
        {
            return;
        }

        var veli = (await AnswersAsync(_veli)).Value!;

        Assert.Equal(1, veli.TotalCount);
        Assert.Null(veli.Items[0].Explanation);
        Assert.Equal(0, veli.Summary.WithExplanation);
        Assert.Equal(1, veli.Summary.WithoutExplanation);

        var filtered = (await AnswersAsync(_ali, lessonId: _lessonId + 1000)).Value!;
        Assert.Equal(0, filtered.TotalCount);
        Assert.Empty(filtered.Items);
        Assert.Equal(3, filtered.Summary.TotalAnswers);

        Assert.Equal(3, (await AnswersAsync(_ali, lessonId: _lessonId)).Value!.TotalCount);
    }

    [Fact]
    public async Task Answers_paging_validates()
    {
        if (!_available)
        {
            return;
        }

        Assert.Equal(ServiceErrorKind.Validation, (await AnswersAsync(_ali, page: 0)).Error);
        Assert.Equal(ServiceErrorKind.Validation, (await AnswersAsync(_ali, pageSize: 51)).Error);
        Assert.Single((await AnswersAsync(_ali, page: 3, pageSize: 1)).Value!.Items);
    }
}
