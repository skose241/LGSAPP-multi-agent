using System.Text.Json;
using System.Text.Json.Serialization;
using LGSApp.Api.Extensions;
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
    await DbSeeder.EnsureAiAccountAsync(app.Services);
    await DbSeeder.SeedAdminAsync(app.Services);
    await DbSeeder.BackfillCommentFingerprintsAsync(app.Services);
    await DbSeeder.SeedReferenceDataAsync(app.Services);
}
catch (Exception ex)
{
    app.Logger.LogError(ex, "Başlangıç seed işlemi başarısız oldu.");
}

app.Run();
