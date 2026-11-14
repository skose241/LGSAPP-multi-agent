using System.Globalization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Options;

public enum AiProvider
{
    None = 0,
    Gemini = 1,
    Fake = 2
}

public sealed class GeminiConnectionOptions
{
    public string BaseUrl { get; set; } = "https://generativelanguage.googleapis.com";
    public string ApiVersion { get; set; } = "v1beta";
    public string QuestionApiKey { get; set; } = string.Empty;
    public string SolutionApiKey { get; set; } = string.Empty;
}

public sealed class AiQuestionOptions
{
    public string Model { get; set; } = string.Empty;
    public string ThinkingLevel { get; set; } = "low";
    public int MaxOutputTokens { get; set; } = 4096;
    public int TimeoutSeconds { get; set; } = 90;
    public int MaxAttempts { get; set; } = 3;
    public int SlotBudgetSeconds { get; set; } = 240;
    public int Max429WaitSeconds { get; set; } = 40;
    public bool VerifyEnabled { get; set; } = true;
}

public sealed class AiSolutionOptions
{
    public string Model { get; set; } = string.Empty;
    public string ThinkingLevel { get; set; } = "medium";
    public int MaxOutputTokens { get; set; } = 8192;
    public int TimeoutSeconds { get; set; } = 60;
    public int MaxAttempts { get; set; } = 2;
    public int Max429WaitSeconds { get; set; } = 5;
    public int ImageMaxEdge { get; set; } = 1536;
    public int ImageJpegQuality { get; set; } = 80;
}

public sealed class AiPricingOptions
{
    public decimal InputPerMTokUsd { get; set; }
    public decimal OutputPerMTokUsd { get; set; }
}

public sealed class AiFakeOptions
{
    public string FailSlots { get; set; } = string.Empty;
    public int DelayMs { get; set; }
    public int MismatchEveryNth { get; set; }
    public string UnreadableQuestionIds { get; set; } = string.Empty;

    public IReadOnlySet<int> FailSlotSet => FakeGeneratorOptions.ParseSlots(FailSlots) ?? [];

    public IReadOnlySet<int> UnreadableIdSet => ParseIds(UnreadableQuestionIds) ?? [];

    public static HashSet<int>? ParseIds(string? value)
    {
        var result = new HashSet<int>();
        if (string.IsNullOrWhiteSpace(value))
        {
            return result;
        }

        foreach (var part in value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!int.TryParse(part, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) || id < 1)
            {
                return null;
            }

            result.Add(id);
        }

        return result;
    }
}

public sealed class AiOptions
{
    public const string SectionName = "Ai";
    public const string LegacyQuestionKeyName = "GEMINI_API_KEY_Soru";
    public const string LegacySolutionKeyName = "GEMINI_API_KEY_Cozum";
    public const string LegacyFakeFlagName = "Scheduler:UseFakeGenerator";

    public static readonly string[] ThinkingLevels = ["", "minimal", "low", "medium", "high"];

    public AiProvider Provider { get; set; } = AiProvider.None;
    public bool Required { get; set; }
    public GeminiConnectionOptions Gemini { get; set; } = new();
    public AiQuestionOptions Question { get; set; } = new();
    public AiSolutionOptions Solution { get; set; } = new();
    public Dictionary<string, AiPricingOptions> Pricing { get; set; } = new();
    public AiFakeOptions Fake { get; set; } = new();

    public bool LegacyFakeRequested { get; set; }

    public bool QuestionKeyPresent => !string.IsNullOrEmpty(Gemini.QuestionApiKey);
    public bool SolutionKeyPresent => !string.IsNullOrEmpty(Gemini.SolutionApiKey);
    public bool QuestionConfigured => Provider == AiProvider.Fake || (Provider == AiProvider.Gemini && QuestionKeyPresent && Question.Model.Length > 0);
    public bool SolutionConfigured => Provider == AiProvider.Fake || (Provider == AiProvider.Gemini && SolutionKeyPresent && Solution.Model.Length > 0);

    public static string? Validate(AiOptions o, bool isDevelopment)
    {
        if (!Enum.IsDefined(o.Provider))
        {
            return "Ai:Provider 'None', 'Gemini' veya 'Fake' olmalıdır.";
        }

        if (o.Provider == AiProvider.Fake && !isDevelopment)
        {
            return "Ai:Provider 'Fake' yalnızca Development ortamında kullanılabilir.";
        }

        if (o.LegacyFakeRequested && o.Provider == AiProvider.Gemini)
        {
            return "Scheduler:UseFakeGenerator açıkken Ai:Provider 'Gemini' olamaz. Biri kapatılmalıdır.";
        }

        if (o.Required && o.Provider != AiProvider.Gemini)
        {
            return "Ai:Required açıkken Ai:Provider 'Gemini' olmalıdır.";
        }

        if (o.Required && (!o.QuestionKeyPresent || !o.SolutionKeyPresent))
        {
            return "Ai:Required açıkken soru ve çözüm Gemini anahtarlarının ikisi de tanımlı olmalıdır.";
        }

        if (HasInvalidKey(o.Gemini.QuestionApiKey))
        {
            return "Gemini soru anahtarı boşluk veya kontrol karakteri içeriyor (Ai:Gemini:QuestionApiKey / GEMINI_API_KEY_Soru).";
        }

        if (HasInvalidKey(o.Gemini.SolutionApiKey))
        {
            return "Gemini çözüm anahtarı boşluk veya kontrol karakteri içeriyor (Ai:Gemini:SolutionApiKey / GEMINI_API_KEY_Cozum).";
        }

        if (o.Question.ThinkingLevel is null || !ThinkingLevels.Contains(o.Question.ThinkingLevel)
            || o.Solution.ThinkingLevel is null || !ThinkingLevels.Contains(o.Solution.ThinkingLevel))
        {
            return "Ai:Question:ThinkingLevel ve Ai:Solution:ThinkingLevel boş, 'minimal', 'low', 'medium' veya 'high' olmalıdır.";
        }

        if (o.Question.MaxOutputTokens is < 256 or > 65536 || o.Solution.MaxOutputTokens is < 256 or > 65536)
        {
            return "Ai:Question:MaxOutputTokens ve Ai:Solution:MaxOutputTokens 256 ile 65536 arasında olmalıdır.";
        }

        if (o.Question.TimeoutSeconds is < 5 or > 300 || o.Solution.TimeoutSeconds is < 5 or > 300)
        {
            return "Ai:Question:TimeoutSeconds ve Ai:Solution:TimeoutSeconds 5 ile 300 arasında olmalıdır.";
        }

        if (o.Question.MaxAttempts is < 1 or > 5 || o.Solution.MaxAttempts is < 1 or > 5)
        {
            return "Ai:Question:MaxAttempts ve Ai:Solution:MaxAttempts 1 ile 5 arasında olmalıdır.";
        }

        if (o.Question.SlotBudgetSeconds < o.Question.TimeoutSeconds || o.Question.SlotBudgetSeconds > 900)
        {
            return "Ai:Question:SlotBudgetSeconds, TimeoutSeconds değerinden küçük olamaz ve 900'ü aşamaz.";
        }

        if (o.Question.Max429WaitSeconds is < 0 or > 120 || o.Solution.Max429WaitSeconds is < 0 or > 120)
        {
            return "Ai:Question:Max429WaitSeconds ve Ai:Solution:Max429WaitSeconds 0 ile 120 arasında olmalıdır.";
        }

        if (o.Solution.ImageMaxEdge is < 256 or > 4096 || o.Solution.ImageJpegQuality is < 30 or > 100)
        {
            return "Ai:Solution:ImageMaxEdge 256-4096, ImageJpegQuality 30-100 arasında olmalıdır.";
        }

        foreach (var (model, price) in o.Pricing)
        {
            if (string.IsNullOrWhiteSpace(model) || price.InputPerMTokUsd < 0 || price.OutputPerMTokUsd < 0)
            {
                return "Ai:Pricing girdileri model adı içermeli ve fiyatlar negatif olmamalıdır.";
            }
        }

        if (o.Fake.DelayMs is < 0 or > 60000
            || o.Fake.MismatchEveryNth is < 0 or > 1000
            || FakeGeneratorOptions.ParseSlots(o.Fake.FailSlots) is null
            || AiFakeOptions.ParseIds(o.Fake.UnreadableQuestionIds) is null)
        {
            return "Ai:Fake ayarları geçersiz (FailSlots 1-20 arası virgülle ayrılmış sayılar, DelayMs 0-60000, MismatchEveryNth 0-1000, UnreadableQuestionIds soru numaraları).";
        }

        if (o.Provider == AiProvider.Gemini)
        {
            if (!Uri.TryCreate(o.Gemini.BaseUrl, UriKind.Absolute, out var baseUrl)
                || (baseUrl.Scheme != Uri.UriSchemeHttps && !(baseUrl.Scheme == Uri.UriSchemeHttp && baseUrl.IsLoopback))
                || !string.IsNullOrEmpty(baseUrl.Query))
            {
                return "Ai:Gemini:BaseUrl geçerli bir https adresi olmalıdır (http yalnızca yerel adreslerde kabul edilir).";
            }

            if (string.IsNullOrWhiteSpace(o.Gemini.ApiVersion) || o.Gemini.ApiVersion.Any(c => !char.IsAsciiLetterOrDigit(c)))
            {
                return "Ai:Gemini:ApiVersion geçerli bir sürüm adı olmalıdır (örnek v1beta).";
            }

            if (string.IsNullOrWhiteSpace(o.Question.Model) || string.IsNullOrWhiteSpace(o.Solution.Model))
            {
                return "Ai:Provider 'Gemini' iken Ai:Question:Model ve Ai:Solution:Model boş olamaz.";
            }

            if (!IsValidModelName(o.Question.Model) || !IsValidModelName(o.Solution.Model))
            {
                return "Ai:Question:Model ve Ai:Solution:Model yalnızca harf, rakam, '-', '.' ve '_' içerebilir.";
            }
        }

        return null;
    }

    private static bool IsValidModelName(string model) =>
        model.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '.' or '_');

    private static bool HasInvalidKey(string? key) =>
        !string.IsNullOrEmpty(key) && key.Any(c => char.IsWhiteSpace(c) || char.IsControl(c));
}

public sealed class AiOptionsPostConfigure(IConfiguration configuration) : IPostConfigureOptions<AiOptions>
{
    public void PostConfigure(string? name, AiOptions options)
    {
        if (string.IsNullOrEmpty(options.Gemini.QuestionApiKey))
        {
            options.Gemini.QuestionApiKey = configuration[AiOptions.LegacyQuestionKeyName] ?? string.Empty;
        }

        if (string.IsNullOrEmpty(options.Gemini.SolutionApiKey))
        {
            options.Gemini.SolutionApiKey = configuration[AiOptions.LegacySolutionKeyName] ?? string.Empty;
        }

        options.Pricing = new Dictionary<string, AiPricingOptions>(options.Pricing, StringComparer.OrdinalIgnoreCase);

        var legacyFake = configuration.GetValue<bool>(AiOptions.LegacyFakeFlagName);
        options.LegacyFakeRequested = legacyFake;
        if (legacyFake && options.Provider == AiProvider.None)
        {
            options.Provider = AiProvider.Fake;
        }

        var legacy = configuration.GetSection($"{SchedulerOptions.SectionName}:FakeGenerator").Get<FakeGeneratorOptions>();
        if (legacy is not null)
        {
            if (string.IsNullOrWhiteSpace(options.Fake.FailSlots))
            {
                options.Fake.FailSlots = legacy.FailSlots;
            }

            if (options.Fake.DelayMs == 0)
            {
                options.Fake.DelayMs = legacy.DelayMs;
            }
        }
    }
}

public sealed class AiOptionsValidator(IHostEnvironment environment) : IValidateOptions<AiOptions>
{
    public ValidateOptionsResult Validate(string? name, AiOptions options) =>
        AiOptions.Validate(options, environment.IsDevelopment()) is { } message
            ? ValidateOptionsResult.Fail(message)
            : ValidateOptionsResult.Success;
}

public static class AiOptionsExtensions
{
    public static IServiceCollection AddAiOptions(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<IPostConfigureOptions<AiOptions>, AiOptionsPostConfigure>();
        services.AddSingleton<IValidateOptions<AiOptions>, AiOptionsValidator>();
        services.AddOptions<AiOptions>().Bind(configuration.GetSection(AiOptions.SectionName)).ValidateOnStart();
        return services;
    }
}
