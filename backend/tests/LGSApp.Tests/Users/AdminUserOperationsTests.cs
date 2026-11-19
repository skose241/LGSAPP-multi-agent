using System.Reflection;
using System.Security.Claims;
using LGSApp.Api.Authorization;
using LGSApp.Api.Controllers;
using LGSApp.Api.Dtos;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Reports;
using LGSApp.Infrastructure.Services.Users;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LGSApp.Tests.Users;

public sealed class AdminUserOperationsTests : IAsyncLifetime
{
    private readonly string _database = TestDatabase.NewName();
    private bool _available;
    private ServiceProvider _provider = null!;
    private int _mudur;
    private int _teacher;
    private int _student;
    private int _student2;
    private int _ai;
    private int _lesson;
    private int _inactiveLesson;
    private int _questionId;

    public async Task InitializeAsync()
    {
        _available = await TestDatabase.TryCreateAsync(_database, async db =>
        {
            var lesson = new Lesson { Name = "Matematik", Session = LessonSession.Sayisal, OrderNo = 1, IsActive = true };
            var inactive = new Lesson { Name = "Eski", Session = LessonSession.Sayisal, OrderNo = 2, IsActive = false };
            db.Lessons.AddRange(lesson, inactive);
            await db.SaveChangesAsync();
            _lesson = lesson.Id;
            _inactiveLesson = inactive.Id;

            _mudur = await AddUserAsync(db, "mudur1", Roles.MudurId);
            _teacher = await AddUserAsync(db, "ogretmen1", Roles.OgretmenId);
            _student = await AddUserAsync(db, "ogrenci1", Roles.OgrenciId);
            _student2 = await AddUserAsync(db, "ogrenci2", Roles.OgrenciId);
            _ai = await AddUserAsync(db, "yapayzeka", Roles.AiId);

            var question = new Question
            {
                AuthorUserId = _student,
                LessonId = _lesson,
                Source = QuestionSource.Student,
                Text = "Soru",
                CorrectOption = 1,
                PublishedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow
            };
            db.Questions.Add(question);
            await db.SaveChangesAsync();
            _questionId = question.Id;
        });

        if (_available)
        {
            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:DefaultConnection"] = TestDatabase.ConnectionString(_database), ["Storage:ConnectionString"] = "UseDevelopmentStorage=true", ["RecoveryCodes:Pepper"] = Convert.ToBase64String(new byte[48]) })
                .Build();
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddDataProtection();
            services.AddInfrastructure(configuration);
            services.AddScoped<IUserValidator<ApplicationUser>, RejectingUserValidator>();
            _provider = services.BuildServiceProvider();
        }
    }

    public async Task DisposeAsync()
    {
        if (_available)
        {
            await _provider.DisposeAsync();
            await TestDatabase.DropAsync(_database);
        }
    }

    private static async Task<int> AddUserAsync(AppDbContext db, string name, int roleId)
    {
        var user = new ApplicationUser
        {
            UserName = name,
            NormalizedUserName = name.ToUpperInvariant(),
            SecurityStamp = Guid.NewGuid().ToString(),
            FirstName = name,
            LastName = "T"
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        db.UserRoles.Add(new IdentityUserRole<int> { UserId = user.Id, RoleId = roleId });
        await db.SaveChangesAsync();
        return user.Id;
    }

    private sealed class RejectingUserValidator : IUserValidator<ApplicationUser>
    {
        public Task<IdentityResult> ValidateAsync(UserManager<ApplicationUser> manager, ApplicationUser user) =>
            Task.FromResult(user.UserName == "reddedilen.kullanici"
                ? IdentityResult.Failed(new IdentityError { Code = "Test", Description = "Reddedildi." })
                : IdentityResult.Success);
    }

    private (AdminUsersController Controller, IServiceScope Scope) NewController(int actorId)
    {
        var scope = _provider.CreateScope();
        var sp = scope.ServiceProvider;
        var controller = new AdminUsersController(
            sp.GetRequiredService<UserManager<ApplicationUser>>(),
            sp.GetRequiredService<OneTimePasswordService>(),
            sp.GetRequiredService<AppDbContext>(),
            sp.GetRequiredService<IAdminUserService>())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, actorId.ToString())], "test"))
                }
            }
        };
        return (controller, scope);
    }

    private static T Ok<T>(IActionResult result) where T : class
    {
        var ok = Assert.IsType<OkObjectResult>(result);
        return Assert.IsType<T>(ok.Value);
    }

    private static T Value<T>(ActionResult<T> result) where T : class
    {
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        return Assert.IsType<T>(ok.Value);
    }

    private static Dictionary<string, string[]> ValidationErrors(IActionResult result)
    {
        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, objectResult.StatusCode);
        return Assert.IsAssignableFrom<ValidationProblemDetails>(objectResult.Value).Errors
            .ToDictionary(p => p.Key, p => p.Value);
    }

    private async Task<int> CountUsersAsync()
    {
        await using var db = TestDatabase.Open(_database);
        return await db.Users.CountAsync();
    }

    [Fact]
    public void Every_action_requires_the_mudur_policy()
    {
        var type = typeof(AdminUsersController);
        var classPolicy = type.GetCustomAttribute<AuthorizeAttribute>();
        Assert.Equal(Policies.MudurOnly, classPolicy?.Policy);

        var actions = type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);
        Assert.Contains(actions, m => m.Name == nameof(AdminUsersController.UpdateProfile));
        Assert.Contains(actions, m => m.Name == nameof(AdminUsersController.BulkCreate));
        Assert.All(actions, m => Assert.Null(m.GetCustomAttribute<AllowAnonymousAttribute>()));
    }

    [Fact]
    public async Task Update_profile_succeeds_for_student_and_keeps_role()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var result = await controller.UpdateProfile(_student2, new UpdateUserProfileRequest("  Ali ", " Veli  ", " 8-A "), CancellationToken.None);
            var dto = Ok<AdminUserDto>(result);
            Assert.Equal("Ali", dto.FirstName);
            Assert.Equal("Veli", dto.LastName);
            Assert.Equal("8-A", dto.ClassName);
            Assert.Equal(Roles.Ogrenci, dto.Role);
            Assert.Equal("ogrenci2", dto.UserName);
        }
    }

    [Fact]
    public async Task Update_profile_stores_html_as_plain_text()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var dto = Ok<AdminUserDto>(await controller.UpdateProfile(_student2, new UpdateUserProfileRequest("<b>Ali</b>", "<script>x</script>", null), CancellationToken.None));
            Assert.Equal("<b>Ali</b>", dto.FirstName);
            Assert.Equal("<script>x</script>", dto.LastName);
            Assert.Null(dto.ClassName);
        }
    }

    [Fact]
    public async Task Update_profile_ignores_class_name_for_non_students()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var dto = Ok<AdminUserDto>(await controller.UpdateProfile(_teacher, new UpdateUserProfileRequest("Ayşe", "Öğretmen", "8-A"), CancellationToken.None));
            Assert.Equal(Roles.Ogretmen, dto.Role);
            Assert.Null(dto.ClassName);
            Assert.Equal("Ayşe", dto.FirstName);
        }
    }

    [Fact]
    public async Task Update_profile_rejects_ai_account()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var result = await controller.UpdateProfile(_ai, new UpdateUserProfileRequest("A", "B", null), CancellationToken.None);
            var problem = Assert.IsAssignableFrom<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
        }
    }

    [Fact]
    public async Task Update_profile_validates_input_and_unknown_user()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var errors = ValidationErrors(await controller.UpdateProfile(
                _student, new UpdateUserProfileRequest("   ", new string('x', 101), new string('c', 51)), CancellationToken.None));
            Assert.Contains("firstName", errors.Keys);
            Assert.Contains("lastName", errors.Keys);
            Assert.Contains("className", errors.Keys);

            var missing = Assert.IsAssignableFrom<ObjectResult>(
                await controller.UpdateProfile(9999, new UpdateUserProfileRequest("A", "B", null), CancellationToken.None));
            Assert.Equal(StatusCodes.Status404NotFound, missing.StatusCode);
        }
    }

    [Fact]
    public async Task Update_profile_returns_409_on_concurrent_change()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var loaded = await users.FindByIdAsync(_student2.ToString());
            Assert.NotNull(loaded);

            await using (var other = TestDatabase.Open(_database))
            {
                await other.Database.ExecuteSqlRawAsync("UPDATE AspNetUsers SET ConcurrencyStamp = 'changed' WHERE Id = {0}", _student2);
            }

            loaded.FirstName = "Yeni";
            var result = await users.UpdateAsync(loaded);
            Assert.Contains(result.Errors, e => e.Code == nameof(IdentityErrorDescriber.ConcurrencyFailure));
            db.ChangeTracker.Clear();

            var fresh = Ok<AdminUserDto>(await controller.UpdateProfile(_student2, new UpdateUserProfileRequest("Son", "Hal", null), CancellationToken.None));
            Assert.Equal("Son", fresh.FirstName);
        }
    }

    [Fact]
    public async Task Bulk_create_creates_all_users_with_passwords()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var before = await CountUsersAsync();
            var result = await controller.BulkCreate(new BulkCreateUsersRequest(
            [
                new BulkUserItemRequest("yeni.ogrenci", " Ece ", "Kaya", "ogrenci", "8-B"),
                new BulkUserItemRequest("yeni.ogretmen", "Can", "Er", "OGRETMEN", null, _lesson)
            ]), CancellationToken.None);

            var created = Assert.IsType<CreatedAtActionResult>(result);
            Assert.Equal(StatusCodes.Status201Created, created.StatusCode);
            var body = Assert.IsType<BulkCreatedUsersResponse>(created.Value);
            Assert.Equal(2, body.Users.Count);
            Assert.Equal("yeni.ogrenci", body.Users[0].User.UserName);
            Assert.Equal("Ece", body.Users[0].User.FirstName);
            Assert.Equal(Roles.Ogrenci, body.Users[0].User.Role);
            Assert.True(body.Users[0].User.MustChangePassword);
            Assert.Equal(_mudur, body.Users[0].User.CreatedByUserId);
            Assert.Equal(_lesson, body.Users[1].User.BranchLessonId);
            Assert.Equal("Matematik", body.Users[1].User.BranchLessonName);
            Assert.All(body.Users, u => Assert.False(string.IsNullOrWhiteSpace(u.OneTimePassword)));
            Assert.NotEqual(body.Users[0].OneTimePassword, body.Users[1].OneTimePassword);
            Assert.Equal(before + 2, await CountUsersAsync());

            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var stored = await users.FindByNameAsync("yeni.ogrenci");
            Assert.NotNull(stored);
            Assert.True(await users.CheckPasswordAsync(stored, body.Users[0].OneTimePassword));
            Assert.True(await users.IsInRoleAsync(stored, Roles.Ogrenci));
        }
    }

    [Fact]
    public async Task Bulk_create_with_duplicate_name_inside_request_creates_nobody()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var before = await CountUsersAsync();
            var errors = ValidationErrors(await controller.BulkCreate(new BulkCreateUsersRequest(
            [
                new BulkUserItemRequest("ayni.ad", "A", "B", "ogrenci", null),
                new BulkUserItemRequest("baska.ad", "A", "B", "ogrenci", null),
                new BulkUserItemRequest("AYNI.AD", "C", "D", "ogrenci", null)
            ]), CancellationToken.None));

            Assert.Equal(["items[2].userName"], errors.Keys.ToArray());
            Assert.Equal(before, await CountUsersAsync());
        }
    }

    [Fact]
    public async Task Bulk_create_with_name_already_in_database_creates_nobody()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var before = await CountUsersAsync();
            var errors = ValidationErrors(await controller.BulkCreate(new BulkCreateUsersRequest(
            [
                new BulkUserItemRequest("temiz.ad", "A", "B", "ogrenci", null),
                new BulkUserItemRequest("OGRENCI1", "C", "D", "ogrenci", null)
            ]), CancellationToken.None));

            Assert.Equal(["items[1].userName"], errors.Keys.ToArray());
            Assert.Equal(before, await CountUsersAsync());
        }
    }

    [Fact]
    public async Task Bulk_create_reports_row_errors_with_indexed_keys()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var before = await CountUsersAsync();
            var errors = ValidationErrors(await controller.BulkCreate(new BulkCreateUsersRequest(
            [
                new BulkUserItemRequest("iyi.ad", "A", "B", "ogrenci", null),
                new BulkUserItemRequest("yapay zeka!", " ", "B", "ogrenci", null),
                new BulkUserItemRequest("ai", "A", "B", "ogrenci", null),
                new BulkUserItemRequest("robot", "A", "B", "ai", null),
                new BulkUserItemRequest("kotu.rol", "A", "B", "admin", null),
                new BulkUserItemRequest("brans.hata", "A", "B", "ogrenci", null, _lesson),
                new BulkUserItemRequest("brans.yok", "A", "B", "ogretmen", null, _inactiveLesson),
                null
            ]), CancellationToken.None));

            Assert.Contains("items[1].userName", errors.Keys);
            Assert.Contains("items[1].firstName", errors.Keys);
            Assert.Contains("items[2].userName", errors.Keys);
            Assert.Contains("items[3].role", errors.Keys);
            Assert.Contains("items[4].role", errors.Keys);
            Assert.Contains("items[5].branchLessonId", errors.Keys);
            Assert.Contains("items[6].branchLessonId", errors.Keys);
            Assert.Contains("items[7].userName", errors.Keys);
            Assert.DoesNotContain("items[0].userName", errors.Keys);
            Assert.Equal(before, await CountUsersAsync());
        }
    }

    [Fact]
    public async Task Bulk_create_rejects_ai_role_like_single_endpoint()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var single = Assert.IsAssignableFrom<ObjectResult>(
                (await controller.Create(new CreateUserRequest("tek.ai", "A", "B", "ai", null), CancellationToken.None)).Result);
            Assert.Equal(StatusCodes.Status400BadRequest, single.StatusCode);

            var errors = ValidationErrors(await controller.BulkCreate(
                new BulkCreateUsersRequest([new BulkUserItemRequest("toplu.ai", "A", "B", "ai", null)]), CancellationToken.None));
            Assert.Contains("items[0].role", errors.Keys);
        }
    }

    [Fact]
    public async Task Bulk_create_rejects_empty_null_and_oversized_lists()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var before = await CountUsersAsync();
            Assert.Contains("items", ValidationErrors(await controller.BulkCreate(new BulkCreateUsersRequest([]), CancellationToken.None)).Keys);
            Assert.Contains("items", ValidationErrors(await controller.BulkCreate(new BulkCreateUsersRequest(null), CancellationToken.None)).Keys);

            var tooMany = Enumerable.Range(0, 101)
                .Select(i => (BulkUserItemRequest?)new BulkUserItemRequest($"toplu{i}", "A", "B", "ogrenci", null))
                .ToList();
            Assert.Contains("items", ValidationErrors(await controller.BulkCreate(new BulkCreateUsersRequest(tooMany), CancellationToken.None)).Keys);
            Assert.Equal(before, await CountUsersAsync());
        }
    }

    [Fact]
    public async Task Bulk_create_accepts_exactly_one_hundred_items()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var before = await CountUsersAsync();
            var items = Enumerable.Range(0, 100)
                .Select(i => (BulkUserItemRequest?)new BulkUserItemRequest($"yuz{i}", "A", "B", "ogrenci", null))
                .ToList();
            var result = await controller.BulkCreate(new BulkCreateUsersRequest(items), CancellationToken.None);
            var body = Assert.IsType<BulkCreatedUsersResponse>(Assert.IsType<CreatedAtActionResult>(result).Value);
            Assert.Equal(100, body.Users.Count);
            Assert.Equal(before + 100, await CountUsersAsync());
        }
    }

    [Fact]
    public void Bulk_create_has_its_own_rate_limit_policy()
    {
        var method = typeof(AdminUsersController).GetMethod(nameof(AdminUsersController.BulkCreate))!;
        var attribute = method.GetCustomAttribute<Microsoft.AspNetCore.RateLimiting.EnableRateLimitingAttribute>();
        Assert.Equal(LGSApp.Api.Extensions.RateLimitingExtensions.BulkUserCreatePolicy, attribute?.PolicyName);
        var rule = new LGSApp.Api.Options.RateLimitingOptions().BulkUserCreate;
        Assert.Equal(3, rule.PermitLimit);
        Assert.Equal(60, rule.WindowSeconds);
    }

    [Fact]
    public async Task Ban_and_unban_fill_and_clear_the_record()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            Assert.IsType<NoContentResult>(await controller.Ban(_student2));
            var banned = Value(await controller.Get(_student2, CancellationToken.None));
            Assert.True(banned.IsBanned);
            Assert.NotNull(banned.BannedAt);
            Assert.True(DateTime.UtcNow - banned.BannedAt.Value < TimeSpan.FromMinutes(1));
            Assert.Equal(_mudur, banned.BannedBy?.Id);
            Assert.Equal("mudur1", banned.BannedBy?.UserName);

            Assert.IsType<NoContentResult>(await controller.Unban(_student2));
            var cleared = Value(await controller.Get(_student2, CancellationToken.None));
            Assert.False(cleared.IsBanned);
            Assert.Null(cleared.BannedAt);
            Assert.Null(cleared.BannedBy);

            await using var db = TestDatabase.Open(_database);
            var row = await db.Users.AsNoTracking().SingleAsync(u => u.Id == _student2);
            Assert.Null(row.BannedAt);
            Assert.Null(row.BannedByUserId);
        }
    }

    [Fact]
    public async Task Bulk_create_rolls_back_everything_when_identity_rejects_a_later_row()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var before = await CountUsersAsync();
            var errors = ValidationErrors(await controller.BulkCreate(new BulkCreateUsersRequest(
            [
                new BulkUserItemRequest("geri.al1", "A", "B", "ogrenci", null),
                new BulkUserItemRequest("geri.al2", "A", "B", "ogretmen", null),
                new BulkUserItemRequest("reddedilen.kullanici", "A", "B", "ogrenci", null)
            ]), CancellationToken.None));

            Assert.Equal(["items[2].userName"], errors.Keys.ToArray());
            Assert.Equal(before, await CountUsersAsync());
            await using var db = TestDatabase.Open(_database);
            Assert.False(await db.Users.AnyAsync(u => u.UserName!.StartsWith("geri.al")));
        }
    }

    [Fact]
    public async Task Class_name_is_stored_only_for_students_in_bulk_and_single_create()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var bulk = Assert.IsType<BulkCreatedUsersResponse>(Assert.IsType<CreatedAtActionResult>(await controller.BulkCreate(new BulkCreateUsersRequest(
            [
                new BulkUserItemRequest("sinif.ogrenci", "A", "B", "ogrenci", "8-A"),
                new BulkUserItemRequest("sinif.ogretmen", "A", "B", "ogretmen", "8-A")
            ]), CancellationToken.None)).Value);
            Assert.Equal("8-A", bulk.Users[0].User.ClassName);
            Assert.Null(bulk.Users[1].User.ClassName);

            var teacher = Assert.IsType<CreatedAtActionResult>((await controller.Create(new CreateUserRequest("tek.ogretmen", "A", "B", "ogretmen", "8-A"), CancellationToken.None)).Result);
            Assert.Null(Assert.IsType<CreatedUserResponse>(teacher.Value).User.ClassName);
            var student = Assert.IsType<CreatedAtActionResult>((await controller.Create(new CreateUserRequest("tek.ogrenci", "A", "B", "ogrenci", " 8-B "), CancellationToken.None)).Result);
            Assert.Equal("8-B", Assert.IsType<CreatedUserResponse>(student.Value).User.ClassName);

            await using var db = TestDatabase.Open(_database);
            Assert.Null((await db.Users.AsNoTracking().SingleAsync(u => u.UserName == "sinif.ogretmen")).ClassName);
            Assert.Null((await db.Users.AsNoTracking().SingleAsync(u => u.UserName == "tek.ogretmen")).ClassName);
        }
    }

    [Fact]
    public async Task Repeated_ban_keeps_the_original_record()
    {
        if (!_available)
        {
            return;
        }

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var other = await AddMudurLikeAsync();

            Assert.IsType<NoContentResult>(await controller.Ban(_student2));
            DateTime firstAt;
            await using (var db = TestDatabase.Open(_database))
            {
                firstAt = (await db.Users.AsNoTracking().SingleAsync(u => u.Id == _student2)).BannedAt!.Value;
            }

            await Task.Delay(50);
            var (second, secondScope) = NewController(other);
            using (secondScope)
            {
                Assert.IsType<NoContentResult>(await second.Ban(_student2));
            }

            await using var check = TestDatabase.Open(_database);
            var row = await check.Users.AsNoTracking().SingleAsync(u => u.Id == _student2);
            Assert.True(row.IsBanned);
            Assert.Equal(_mudur, row.BannedByUserId);
            Assert.Equal(firstAt, row.BannedAt);

            var loaded = await users.FindByIdAsync(_student2.ToString());
            var direct = await users.SetBannedAsync(loaded!, true, other);
            Assert.True(direct.Succeeded);
            await using var again = TestDatabase.Open(_database);
            Assert.Equal(_mudur, (await again.Users.AsNoTracking().SingleAsync(u => u.Id == _student2)).BannedByUserId);
        }
    }

    private async Task<int> AddMudurLikeAsync()
    {
        await using var db = TestDatabase.Open(_database);
        return await AddUserAsync(db, "mudur2", Roles.MudurId);
    }

    private async Task AddReportAsync(int reportedUserId, int reporterUserId, ReportTargetType type, ReportStatus status = ReportStatus.Pending)
    {
        await using var db = TestDatabase.Open(_database);
        int? commentId = null;
        int? solutionId = null;
        if (type == ReportTargetType.Comment)
        {
            var comment = new Comment { QuestionId = _questionId, AuthorUserId = reportedUserId, Body = "Yorum", CreatedAt = DateTime.UtcNow };
            db.Comments.Add(comment);
            await db.SaveChangesAsync();
            commentId = comment.Id;
        }
        else if (type == ReportTargetType.Solution)
        {
            var solution = new Solution { QuestionId = _questionId, AuthorUserId = reportedUserId, Type = SolutionType.Teacher, Text = "Çözüm", CreatedAt = DateTime.UtcNow };
            db.Solutions.Add(solution);
            await db.SaveChangesAsync();
            solutionId = solution.Id;
        }

        db.Reports.Add(new Report
        {
            TargetType = type,
            QuestionId = _questionId,
            CommentId = commentId,
            SolutionId = solutionId,
            ReportedUserId = reportedUserId,
            ReporterUserId = reporterUserId,
            Reason = Enum.GetValues<ReportReason>()[0],
            Description = "Açıklama",
            TargetSnapshot = "Anlık görüntü",
            Status = status,
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Pending_report_count_and_reported_filter_count_all_target_types()
    {
        if (!_available)
        {
            return;
        }

        await AddReportAsync(_student, _student2, ReportTargetType.Question);
        await AddReportAsync(_student, _teacher, ReportTargetType.Comment);
        await AddReportAsync(_student, _student2, ReportTargetType.Solution);
        await AddReportAsync(_student, _mudur, ReportTargetType.Comment, ReportStatus.Resolved);
        await AddReportAsync(_teacher, _student, ReportTargetType.Comment, ReportStatus.Rejected);

        var (controller, scope) = NewController(_mudur);
        using (scope)
        {
            var list = Assert.IsAssignableFrom<IEnumerable<AdminUserDto>>(
                Assert.IsType<OkObjectResult>((await controller.List(null, null, CancellationToken.None)).Result).Value).ToList();
            Assert.Equal(3, list.Single(u => u.Id == _student).PendingReportCount);
            Assert.Equal(0, list.Single(u => u.Id == _teacher).PendingReportCount);
            Assert.Equal(0, list.Single(u => u.Id == _student2).PendingReportCount);

            var filtered = Assert.IsAssignableFrom<IEnumerable<AdminUserDto>>(
                Assert.IsType<OkObjectResult>((await controller.List(null, true, CancellationToken.None)).Result).Value).ToList();
            Assert.Equal([_student], filtered.Select(u => u.Id).ToArray());
            Assert.Equal(3, filtered[0].PendingReportCount);

            var notReported = Assert.IsAssignableFrom<IEnumerable<AdminUserDto>>(
                Assert.IsType<OkObjectResult>((await controller.List(null, false, CancellationToken.None)).Result).Value).ToList();
            Assert.Equal(list.Count, notReported.Count);

            var single = Value(await controller.Get(_student, CancellationToken.None));
            Assert.Equal(3, single.PendingReportCount);
        }
    }

    [Fact]
    public async Task Resolving_a_report_with_ban_fills_the_same_fields()
    {
        if (!_available)
        {
            return;
        }

        await AddReportAsync(_student2, _student, ReportTargetType.Comment);
        int reportId;
        byte[] rowVersion;
        await using (var db = TestDatabase.Open(_database))
        {
            var report = await db.Reports.AsNoTracking().SingleAsync(r => r.ReportedUserId == _student2 && r.Status == ReportStatus.Pending);
            reportId = report.Id;
            rowVersion = report.RowVersion;
        }

        using var scope = _provider.CreateScope();
        var moderation = scope.ServiceProvider.GetRequiredService<IReportModerationService>();
        var resolved = await moderation.ResolveAsync(
            new Actor(_mudur, Roles.Mudur),
            reportId,
            new ResolveReportCommand(ReportResolveAction.BanUser, "Kural ihlali", null, rowVersion));
        Assert.True(resolved.Succeeded, resolved.Message);

        await using var check = TestDatabase.Open(_database);
        var user = await check.Users.AsNoTracking().SingleAsync(u => u.Id == _student2);
        Assert.True(user.IsBanned);
        Assert.NotNull(user.BannedAt);
        Assert.Equal(_mudur, user.BannedByUserId);

        var (controller, controllerScope) = NewController(_mudur);
        using (controllerScope)
        {
            var dto = Value(await controller.Get(_student2, CancellationToken.None));
            Assert.Equal(_mudur, dto.BannedBy?.Id);
            Assert.Equal(0, dto.PendingReportCount);
        }
    }
}
