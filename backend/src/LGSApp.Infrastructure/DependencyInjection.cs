using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Answers;
using LGSApp.Infrastructure.Services.Comments;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Lessons;
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
            .AddEntityFrameworkStores<AppDbContext>()
            .AddDefaultTokenProviders();

        services.AddSingleton<ITokenService, TokenService>();
        services.AddSingleton<DummyPasswordVerifier>();
        services.AddScoped<OneTimePasswordService>();

        services.AddMemoryCache();
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<TurkeyTime>();
        services.AddScoped<UserLookupService>();
        services.AddScoped<ISettingsService, SettingsService>();
        services.AddScoped<IQuestionAccessService, QuestionAccessService>();
        services.AddScoped<ILessonService, LessonService>();
        services.AddScoped<IQuestionService, QuestionService>();
        services.AddScoped<IPointService, PointService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<IAnswerService, AnswerService>();
        services.AddScoped<ISolutionService, SolutionService>();
        services.AddScoped<IReportService, ReportService>();
        services.AddScoped<ICommentService, CommentService>();

        return services;
    }
}
