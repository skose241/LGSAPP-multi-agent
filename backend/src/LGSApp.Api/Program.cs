using System.Text.Json;
using System.Text.Json.Serialization;
using LGSApp.Api.Extensions;
using LGSApp.Domain.Constants;
using LGSApp.Infrastructure;
using LGSApp.Infrastructure.Persistence;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddAppForwardedHeaders(builder.Configuration, builder.Environment);

builder.Services.AddControllers()
    .AddTurkishModelBinding()
    .AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));
builder.Services.AddTurkishProblemDetails();
builder.Services.AddOpenApiWithJwt();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddJwtAuthentication(builder.Configuration, builder.Environment);
builder.Services.AddAppRateLimiting(builder.Configuration);

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
    await DbSeeder.EnsureAiAccountAsync(app.Services);
}
catch (SystemAccountIntegrityException ex)
{
    app.Logger.LogCritical("{Message}", ex.Message);
    Environment.ExitCode = 1;
    return;
}
catch (Exception ex)
{
    app.Logger.LogError(ex, "Yapay zekâ sistem hesabı doğrulanamadı.");
}

await RunSeedStepAsync("Müdür hesabı", LogLevel.Error, () => DbSeeder.SeedAdminAsync(app.Services));
await RunSeedStepAsync("Yorum parmak izi doldurma", LogLevel.Warning, () => DbSeeder.BackfillCommentFingerprintsAsync(app.Services));
await RunSeedStepAsync("Örnek ders ve konu", LogLevel.Error, () => DbSeeder.SeedReferenceDataAsync(app.Services));

app.Run();

async Task RunSeedStepAsync(string name, LogLevel failureLevel, Func<Task> step)
{
    try
    {
        await step();
    }
    catch (Exception ex)
    {
        app.Logger.Log(failureLevel, ex, "Başlangıç adımı tamamlanamadı: {Step}", name);
    }
}
