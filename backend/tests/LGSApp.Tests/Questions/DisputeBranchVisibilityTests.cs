using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Ai;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Notifications;
using LGSApp.Infrastructure.Services.Questions;
using LGSApp.Infrastructure.Services.Reports;
using LGSApp.Infrastructure.Services.Settings;
using LGSApp.Infrastructure.Services.Solutions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;

namespace LGSApp.Tests.Questions;

public sealed class DisputeBranchVisibilityTests : IAsyncLifetime
{
    private readonly string _database = TestDatabase.NewName();
    private readonly TurkeyTime _clock = new(TimeProvider.System);
    private bool _available;
    private int _lessonA;
    private int _lessonB;
    private int _teacherA;
    private int _teacherB;
    private int _mudur;
    private int _student;
    private int _questionId;

    private AppDbContext NewDb() => TestDatabase.Open(_database);

    public async Task InitializeAsync()
    {
        _available = await TestDatabase.TryCreateAsync(_database, async db =>
        {
            var lessonA = new Lesson { Name = "Matematik", Session = LessonSession.Sayisal, OrderNo = 1, IsActive = true };
            var lessonB = new Lesson { Name = "Fen", Session = LessonSession.Sayisal, OrderNo = 2, IsActive = true };
            db.Lessons.AddRange(lessonA, lessonB);
            await db.SaveChangesAsync();
            _lessonA = lessonA.Id;
            _lessonB = lessonB.Id;

            _teacherA = await AddUserAsync(db, "ogretmenA", Roles.OgretmenId, _lessonA);
            _teacherB = await AddUserAsync(db, "ogretmenB", Roles.OgretmenId, _lessonB);
            _mudur = await AddUserAsync(db, "mudur1", Roles.MudurId, null);
            _student = await AddUserAsync(db, "ogrenci1", Roles.OgrenciId, null);

            var question = new Question
            {
                AuthorUserId = _student,
                LessonId = _lessonA,
                Source = QuestionSource.Student,
                Text = "Soru",
                CorrectOption = 1,
                PublishedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                IsAnswerDisputed = true,
                AnswerDisputedAt = DateTime.UtcNow,
                AiSuggestedOption = 3
            };
            db.Questions.Add(question);
            await db.SaveChangesAsync();
            _questionId = question.Id;

            db.Solutions.Add(new Solution
            {
                QuestionId = question.Id,
                AuthorUserId = _student,
                Type = SolutionType.Ai,
                Text = "AI çözümü",
                IsHidden = true,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
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

    private QuestionService NewQuestions(AppDbContext db) =>
        new(db, new QuestionAccessService(db, _clock), new UserLookupService(db), new StubFileUrls(), new StubAi());

    private SolutionService NewSolutions(AppDbContext db) =>
        new(db, new SettingsService(db, new MemoryCache(new MemoryCacheOptions())), new QuestionAccessService(db, _clock), null!, new UserLookupService(db), new StubValidator(), new StubFileUrls(), _clock);

    private AnswerDisputeService NewDisputes(AppDbContext db) =>
        new(db, _clock, new UserLookupService(db), NullLogger<AnswerDisputeService>.Instance);

    private AnswerKeyService NewKeys(AppDbContext db) =>
        new(db, new SettingsService(db, new MemoryCache(new MemoryCacheOptions())), new NotificationService(db, _clock), _clock);

    [Fact]
    public async Task Resolver_teacher_sees_dispute_data_and_hidden_ai_solution()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var actor = new Actor(_teacherA, Roles.Ogretmen);
        var detail = (await NewQuestions(db).GetDetailAsync(actor, _questionId)).Value!;
        var solutions = (await NewSolutions(db).ListAsync(actor, _questionId)).Value!;

        Assert.True(detail.Permissions.CanResolveDispute);
        Assert.True(detail.Permissions.CanModerate);
        Assert.Equal((byte)3, detail.AiSuggestedOption);
        Assert.Contains(solutions.Items, s => s.Type == SolutionType.Ai && s.IsHidden);
    }

    [Fact]
    public async Task Mudur_can_resolve_any_branch()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var actor = new Actor(_mudur, Roles.Mudur);
        var detail = (await NewQuestions(db).GetDetailAsync(actor, _questionId)).Value!;

        Assert.True(detail.Permissions.CanResolveDispute);
        Assert.Equal((byte)3, detail.AiSuggestedOption);
    }

    [Fact]
    public async Task Other_branch_teacher_keeps_moderation_but_loses_dispute_data_and_hidden_ai_solution()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var actor = new Actor(_teacherB, Roles.Ogretmen);
        var detail = (await NewQuestions(db).GetDetailAsync(actor, _questionId)).Value!;
        var solutions = (await NewSolutions(db).ListAsync(actor, _questionId)).Value!;

        Assert.True(detail.Permissions.CanModerate);
        Assert.False(detail.Permissions.CanResolveDispute);
        Assert.Null(detail.AiSuggestedOption);
        Assert.DoesNotContain(solutions.Items, s => s.Type == SolutionType.Ai && s.IsHidden);
    }

    [Fact]
    public async Task Student_never_gets_resolve_permission()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var detail = (await NewQuestions(db).GetDetailAsync(new Actor(_student, Roles.Ogrenci), _questionId)).Value!;

        Assert.False(detail.Permissions.CanResolveDispute);
        Assert.Null(detail.AiSuggestedOption);
    }

    [Fact]
    public async Task Dismissing_a_dispute_clears_the_ai_suggestion_and_keeps_the_note()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var actor = new Actor(_teacherA, Roles.Ogretmen);
        var rowVersion = await db.Questions.AsNoTracking().Where(q => q.Id == _questionId).Select(q => q.RowVersion).SingleAsync();

        var result = await NewDisputes(db).DismissAsync(actor, _questionId, new DismissDisputeCommand(rowVersion, "Anahtar doğru"));

        Assert.True(result.Succeeded);
        var question = await db.Questions.AsNoTracking().SingleAsync(q => q.Id == _questionId);
        Assert.Null(question.AiSuggestedOption);
        Assert.False(question.IsAnswerDisputed);
        Assert.Equal("Anahtar doğru", question.AnswerKeyReviewNote);
    }

    [Fact]
    public async Task Changing_the_answer_key_clears_the_ai_suggestion_and_stores_the_note()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var actor = new Actor(_teacherA, Roles.Ogretmen);
        var rowVersion = await db.Questions.AsNoTracking().Where(q => q.Id == _questionId).Select(q => q.RowVersion).SingleAsync();

        var result = await NewKeys(db).ChangeAsync(actor, _questionId, new ChangeAnswerKeyCommand(3, rowVersion, "Yapay zekâ haklı"));

        Assert.True(result.Succeeded);
        var detail = (await NewQuestions(db).GetDetailAsync(actor, _questionId)).Value!;
        Assert.Null(detail.AiSuggestedOption);
        Assert.Equal("Yapay zekâ haklı", detail.AnswerKeyReviewNote);
        Assert.Equal((byte)3, detail.CorrectOption);
    }

    private async Task<int> AddReportAsync(AppDbContext db)
    {
        var report = new Report
        {
            TargetType = ReportTargetType.Question,
            QuestionId = _questionId,
            ReportedUserId = _student,
            ReporterUserId = _student,
            Reason = ReportReason.WrongAnswerKey,
            Description = new string('x', 40),
            TargetSnapshot = "Soru",
            CreatedAt = DateTime.UtcNow
        };
        db.Reports.Add(report);
        await db.SaveChangesAsync();
        return report.Id;
    }

    private ReportModerationService NewReportModeration(AppDbContext db) =>
        new(db, null!, null!, null!, null!, new UserLookupService(db), new StubFileUrls(), _clock);

    [Fact]
    public async Task Report_detail_shows_ai_suggestion_only_to_those_who_can_resolve()
    {
        if (!_available)
        {
            return;
        }

        await using var db = NewDb();
        var reportId = await AddReportAsync(db);
        var service = NewReportModeration(db);

        var own = (await service.GetAsync(new Actor(_teacherA, Roles.Ogretmen), reportId)).Value!.Question!;
        var admin = (await service.GetAsync(new Actor(_mudur, Roles.Mudur), reportId)).Value!.Question!;
        var other = (await service.GetAsync(new Actor(_teacherB, Roles.Ogretmen), reportId)).Value!.Question!;

        Assert.Equal((byte)3, own.AiSuggestedOption);
        Assert.Equal((byte)3, admin.AiSuggestedOption);
        Assert.Null(other.AiSuggestedOption);
    }

    private sealed class StubFileUrls : IFileUrlService
    {
        public Task<IReadOnlyDictionary<int, ImageView>> GetAsync(IEnumerable<int?> fileIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyDictionary<int, ImageView>>(new Dictionary<int, ImageView>());
    }

    private sealed class StubValidator : IStoredFileValidator
    {
        public Task<IReadOnlyList<StoredFileProblem>> ValidateAsync(int userId, IReadOnlyList<int?> imageIds, IReadOnlyCollection<FilePurpose> allowedPurposes, StoredFileScope? scope = null, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<StoredFileProblem>>([]);
    }

    private sealed class StubAi : IAiSolutionService
    {
        public Task<ServiceResult<AiSolutionResponse>> RequestAsync(Actor actor, int questionId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<AiSolutionStateInfo> GetStateAsync(Actor actor, int questionId, bool canSeeDiscussion, CancellationToken cancellationToken = default) =>
            Task.FromResult(new AiSolutionStateInfo(AiSolutionStates.None, false));

        public Task<ServiceResult<AiQuotaStatusView>> GetQuotaAsync(Actor actor, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }
}
