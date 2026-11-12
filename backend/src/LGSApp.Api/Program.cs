using System.Text.Json;
using System.Text.Json.Serialization;
using LGSApp.Api.Extensions;
using LGSApp.Domain.Constants;
using LGSApp.Infrastructure;
using LGSApp.Infrastructure.Persistence;
using Scalar.AspNetCore;

if (LGSApp.Api.ServerCommands.IsCommand(args))
{
    Environment.ExitCode = await LGSApp.Api.ServerCommands.RunAsync(args);
    return;
}

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddAppForwardedHeaders(builder.Configuration, builder.Environment);

var devTimeOffset = builder.Configuration.GetValue<int>("DevTime:OffsetMinutes");
if (devTimeOffset != 0)
{
    if (!builder.Environment.IsDevelopment())
    {
        Console.Error.WriteLine("DevTime:OffsetMinutes yalnızca Development ortamında kullanılabilir. Başlangıç durduruldu.");
        Environment.ExitCode = 1;
        return;
    }

    builder.Services.AddSingleton<TimeProvider>(new LGSApp.Infrastructure.Services.Common.OffsetTimeProvider(TimeSpan.FromMinutes(devTimeOffset)));
}

builder.Services.AddControllers()
    .AddTurkishModelBinding()
    .AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));
builder.Services.AddTurkishProblemDetails();
builder.Services.AddOpenApiWithJwt();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddJwtAuthentication(builder.Configuration, builder.Environment);
builder.Services.AddAppRateLimiting(builder.Configuration);
builder.Services.Configure<LGSApp.Api.Options.ResponseTimingOptions>(builder.Configuration.GetSection(LGSApp.Api.Options.ResponseTimingOptions.SectionName));

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod());
});

builder.Services.AddHealthChecks();

var app = builder.Build();

app.UseAppForwardedHeaders(builder.Configuration, app.Environment);
app.UseProblemJsonCharset();
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();
app.MapHealthChecks("/health").AllowAnonymous();

try
{
    CommentRules.VerifyGlobalization();
}
catch (InvalidOperationException ex)
{
    app.Logger.LogCritical("{Message}", ex.Message);
    Environment.ExitCode = 1;
    return;
}

try
{
    await DbSeeder.RunExclusiveAsync(app.Services, "LGSApp.StartupSeed", async () =>
    {
        await DbSeeder.EnsureUserNameKeysAsync(app.Services);

        try
        {
            await DbSeeder.EnsureAiAccountAsync(app.Services);
        }
        catch (Exception ex) when (ex is not SystemAccountIntegrityException)
        {
            app.Logger.LogError(ex, "Yapay zekâ sistem hesabı doğrulanamadı.");
        }

        await RunSeedStepAsync("Müdür hesabı", LogLevel.Error, () => DbSeeder.SeedAdminAsync(app.Services));
        await RunSeedStepAsync("Yorum parmak izi doldurma", LogLevel.Warning, () => DbSeeder.BackfillCommentFingerprintsAsync(app.Services));
        await RunSeedStepAsync("Örnek ders ve konu", LogLevel.Error, () => DbSeeder.SeedReferenceDataAsync(app.Services));
    });
}
catch (Exception ex) when (ex is SystemAccountIntegrityException or UserNameConflictException)
{
    app.Logger.LogCritical("{Message}", ex.Message);
    Environment.ExitCode = 1;
    return;
}
catch (Exception ex)
{
    app.Logger.LogError(ex, "Başlangıç adımları yürütülemedi.");
}

app.Run();

async Task RunSeedStepAsync(string name, LogLevel failureLevel, Func<Task> step)
{
    try
    {
        await step();
    }
    catch (Exception ex) when (DbSeeder.IsUniqueViolation(ex))
    {
        app.Logger.LogInformation("Başlangıç adımı başka bir örnek tarafından tamamlanmış görünüyor: {Step}", name);
    }
    catch (Exception ex)
    {
        app.Logger.Log(failureLevel, ex, "Başlangıç adımı tamamlanamadı: {Step}", name);
    }
}
