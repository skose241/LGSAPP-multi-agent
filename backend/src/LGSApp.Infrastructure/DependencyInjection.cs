using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Answers;
using LGSApp.Infrastructure.Services.Assignments;
using LGSApp.Infrastructure.Services.Comments;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Leaderboard;
using LGSApp.Infrastructure.Services.Lessons;
using LGSApp.Infrastructure.Services.Likes;
using LGSApp.Infrastructure.Services.Notifications;
using LGSApp.Infrastructure.Services.Points;
using LGSApp.Infrastructure.Services.Questions;
using LGSApp.Infrastructure.Services.Reports;
using LGSApp.Infrastructure.Services.Settings;
using LGSApp.Infrastructure.Services.Solutions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace LGSApp.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.SectionName));
        services.Configure<SeedOptions>(configuration.GetSection(SeedOptions.SectionName));
        services.AddRecoveryCodeOptions(configuration);
        services.AddStorageOptions(configuration);

        services.AddDbContext<AppDbContext>(options =>
            options.UseSqlServer(
                configuration.GetConnectionString("DefaultConnection"),
                sql => sql.EnableRetryOnFailure(5, TimeSpan.FromSeconds(10), null))
                .ConfigureWarnings(w => w.Ignore(CoreEventId.MappedPropertyIgnoredWarning)));

        services.AddIdentityCore<ApplicationUser>(options =>
            {
                options.Password.RequiredLength = 8;
                options.Password.RequireDigit = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireUppercase = true;
                options.Password.RequireNonAlphanumeric = false;
                options.User.RequireUniqueEmail = false;
                options.User.AllowedUserNameCharacters = UserNameRules.AllowedCharacters;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(10);
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.AllowedForNewUsers = true;
            })
            .AddErrorDescriber<TurkishIdentityErrorDescriber>()
            .AddRoles<ApplicationRole>()
            .AddUserManager<AppUserManager>()
            .AddEntityFrameworkStores<AppDbContext>()
            .AddDefaultTokenProviders();

        services.Replace(ServiceDescriptor.Singleton<ILookupNormalizer, TurkishLookupNormalizer>());
        services.Replace(ServiceDescriptor.Scoped<IPasswordValidator<ApplicationUser>, RoleAwarePasswordValidator>());

        services.AddSingleton<ITokenService, TokenService>();
        services.AddSingleton<DummyPasswordVerifier>();
        services.AddScoped<OneTimePasswordService>();
        services.AddScoped<RecoveryCodeService>();
        services.AddScoped<MudurRecoveryService>();

        services.AddMemoryCache();
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<TurkeyTime>();
        services.AddScoped<UserLookupService>();
        services.AddScoped<ISettingsService, SettingsService>();
        services.AddScoped<IQuestionAccessService, QuestionAccessService>();
        services.AddScoped<ILessonService, LessonService>();
        services.AddScoped<IQuestionService, QuestionService>();
        services.AddScoped<IQuestionAuthoringService, QuestionAuthoringService>();
        services.AddScoped<IPointService, PointService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<IAnswerService, AnswerService>();
        services.AddScoped<ISolutionService, SolutionService>();
        services.AddScoped<IReportService, ReportService>();
        services.AddScoped<ICommentService, CommentService>();
        services.AddScoped<IAnswerKeyService, AnswerKeyService>();
        services.AddScoped<IReportModerationService, ReportModerationService>();
        services.AddScoped<ILikeService, LikeService>();
        services.AddScoped<INotificationInboxService, NotificationInboxService>();
        services.AddScoped<IAssignmentNotifier, AssignmentNotifier>();
        services.AddScoped<IAssignmentManagementService, AssignmentManagementService>();
        services.AddScoped<IAssignmentQuestionService, AssignmentQuestionService>();
        services.AddScoped<IAssignmentStudentService, AssignmentStudentService>();
        services.AddScoped<IAssignmentLifecycleService, AssignmentLifecycleService>();
        services.AddSingleton<ILeaderboardCache, LeaderboardCache>();
        services.AddScoped<ILeaderboardService, LeaderboardService>();
        services.AddSingleton<AzureBlobStore>();
        services.AddSingleton<IBlobStore>(sp => sp.GetRequiredService<AzureBlobStore>());
        services.AddHostedService<BlobContainerInitializer>();
        services.AddSingleton<IImageProcessor, SkiaImageProcessor>();
        services.AddScoped<IFileUrlService, FileUrlService>();
        services.AddScoped<IStoredFileValidator, StoredFileValidator>();
        services.AddScoped<IFileUploadService, FileUploadService>();
        services.AddScoped<IFileCleanupService, FileCleanupService>();
        services.AddHostedService<FileCleanupWorker>();

        return services;
    }
}
