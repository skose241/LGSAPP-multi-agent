using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Ai;

public static class AiServiceCollectionExtensions
{
    public const string GeminiClientLogCategory = "System.Net.Http.HttpClient.IGeminiClient";

    public static IServiceCollection AddAiServices(this IServiceCollection services, Microsoft.Extensions.Configuration.IConfiguration configuration)
    {
        services.AddLogging(logging => logging.AddFilter(GeminiClientLogCategory, LogLevel.Warning));

        services.AddSingleton<IGeminiJitter, RandomGeminiJitter>();
        services.AddSingleton<AiCostCalculator>();

        services.AddHttpClient<IGeminiClient, GeminiRestClient>(client => client.Timeout = Timeout.InfiniteTimeSpan)
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                PooledConnectionLifetime = TimeSpan.FromMinutes(5),
                ConnectTimeout = TimeSpan.FromSeconds(15)
            })
            .RedactLoggedHeaders([GeminiRestClient.ApiKeyHeader, "Authorization"]);

        services.AddSingleton<NotConfiguredQuestionGenerator>();
        services.AddSingleton<FakeQuestionGenerator>();
        services.AddSingleton<IQuestionGenerator>(sp =>
            sp.GetRequiredService<IOptions<AiOptions>>().Value.Provider == AiProvider.Fake
                ? sp.GetRequiredService<FakeQuestionGenerator>()
                : sp.GetRequiredService<NotConfiguredQuestionGenerator>());

        services.AddHostedService<AiStartupReporter>();
        return services;
    }
}

public sealed class AiStartupReporter(IOptions<AiOptions> options, ILogger<AiStartupReporter> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        var o = options.Value;
        switch (o.Provider)
        {
            case AiProvider.Gemini when !o.QuestionKeyPresent || !o.SolutionKeyPresent:
                logger.LogWarning(
                    "Yapay zekâ anahtarları eksik (soru: {QuestionKey}, çözüm: {SolutionKey}). Yapay zekâ özellikleri kapalı çalışacak.",
                    o.QuestionKeyPresent ? "var" : "yok",
                    o.SolutionKeyPresent ? "var" : "yok");
                break;
            case AiProvider.Gemini:
                logger.LogInformation("Yapay zekâ sağlayıcısı: Gemini (soru modeli {QuestionModel}, çözüm modeli {SolutionModel}).", o.Question.Model, o.Solution.Model);
                break;
            case AiProvider.Fake:
                logger.LogWarning("Yapay zekâ sağlayıcısı: Fake (yalnızca geliştirme). Gerçek Gemini çağrısı yapılmayacak.");
                break;
            default:
                logger.LogWarning("Yapay zekâ sağlayıcısı kapalı (Ai:Provider=None). Yapay zekâ özellikleri çalışmayacak.");
                break;
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
