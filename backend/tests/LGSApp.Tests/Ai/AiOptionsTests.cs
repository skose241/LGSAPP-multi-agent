using LGSApp.Infrastructure.Options;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace LGSApp.Tests.Ai;

public class AiOptionsTests
{
    private sealed class TestEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "LGSApp.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static AiOptions Load(Dictionary<string, string?> values, out string? error, string environment = "Production")
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestEnvironment(environment));
        services.AddSingleton<IConfiguration>(configuration);
        services.AddAiOptions(configuration);
        using var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<AiOptions>>();
        try
        {
            var value = options.Value;
            error = null;
            return value;
        }
        catch (OptionsValidationException ex)
        {
            error = ex.Failures.First();
            return new AiOptions();
        }
    }

    private static Dictionary<string, string?> Gemini(Action<Dictionary<string, string?>>? tweak = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["Ai:Provider"] = "Gemini",
            ["Ai:Question:Model"] = "gemini-3.8-flash",
            ["Ai:Solution:Model"] = "gemini-3.8-flash"
        };
        tweak?.Invoke(values);
        return values;
    }

    [Fact]
    public void Gemini_without_keys_starts_and_reports_unconfigured()
    {
        var options = Load(Gemini(), out var error);

        Assert.Null(error);
        Assert.False(options.QuestionConfigured);
        Assert.False(options.SolutionConfigured);
    }

    [Fact]
    public void Gemini_with_keys_is_configured()
    {
        var options = Load(Gemini(v => { v["Ai:Gemini:QuestionApiKey"] = "q"; v["Ai:Gemini:SolutionApiKey"] = "s"; }), out var error);

        Assert.Null(error);
        Assert.True(options.QuestionConfigured);
        Assert.True(options.SolutionConfigured);
    }

    [Fact]
    public void Legacy_environment_key_names_are_mapped()
    {
        var options = Load(Gemini(v => { v["GEMINI_API_KEY_Soru"] = "legacy-q"; v["GEMINI_API_KEY_Cozum"] = "legacy-s"; }), out var error);

        Assert.Null(error);
        Assert.Equal("legacy-q", options.Gemini.QuestionApiKey);
        Assert.Equal("legacy-s", options.Gemini.SolutionApiKey);
    }

    [Fact]
    public void New_key_names_win_over_legacy_ones()
    {
        var options = Load(Gemini(v => { v["Ai:Gemini:QuestionApiKey"] = "new"; v["GEMINI_API_KEY_Soru"] = "old"; }), out _);

        Assert.Equal("new", options.Gemini.QuestionApiKey);
    }

    [Fact]
    public void Legacy_fake_flag_enables_fake_when_provider_unset()
    {
        var options = Load(new() { ["Scheduler:UseFakeGenerator"] = "true", ["Scheduler:FakeGenerator:FailSlots"] = "2", ["Scheduler:FakeGenerator:DelayMs"] = "40" }, out var error, "Development");

        Assert.Null(error);
        Assert.Equal(AiProvider.Fake, options.Provider);
        Assert.Equal("2", options.Fake.FailSlots);
        Assert.Equal(40, options.Fake.DelayMs);
    }

    [Fact]
    public void Ai_fake_settings_win_over_legacy_ones()
    {
        var options = Load(new() { ["Ai:Provider"] = "Fake", ["Ai:Fake:FailSlots"] = "1", ["Scheduler:FakeGenerator:FailSlots"] = "2" }, out var error, "Development");

        Assert.Null(error);
        Assert.Equal("1", options.Fake.FailSlots);
    }

    [Fact]
    public void Legacy_fake_flag_conflicting_with_gemini_is_an_error()
    {
        Load(Gemini(v => v["Scheduler:UseFakeGenerator"] = "true"), out var error, "Development");

        Assert.Contains("UseFakeGenerator", error);
    }

    [Fact]
    public void Fake_provider_is_development_only()
    {
        Load(new() { ["Ai:Provider"] = "Fake" }, out var production);
        Load(new() { ["Ai:Provider"] = "Fake" }, out var development, "Development");

        Assert.Contains("Development", production);
        Assert.Null(development);
    }

    [Theory]
    [InlineData("Ai:Gemini:BaseUrl", "ftp://example.test")]
    [InlineData("Ai:Gemini:BaseUrl", "http://example.test")]
    [InlineData("Ai:Gemini:BaseUrl", "yanlis")]
    [InlineData("Ai:Gemini:ApiVersion", "v1/beta")]
    [InlineData("Ai:Gemini:ApiVersion", "")]
    [InlineData("Ai:Question:Model", "")]
    [InlineData("Ai:Solution:Model", "model adı")]
    [InlineData("Ai:Gemini:QuestionApiKey", "anahtar boşluklu")]
    [InlineData("Ai:Gemini:SolutionApiKey", "anahtar\nsatır")]
    [InlineData("Ai:Question:ThinkingLevel", "ultra")]
    [InlineData("Ai:Question:MaxAttempts", "0")]
    [InlineData("Ai:Question:TimeoutSeconds", "1")]
    [InlineData("Ai:Question:SlotBudgetSeconds", "10")]
    [InlineData("Ai:Solution:ImageMaxEdge", "10")]
    [InlineData("Ai:Solution:ImageJpegQuality", "5")]
    [InlineData("Ai:Fake:FailSlots", "x")]
    [InlineData("Ai:Fake:UnreadableQuestionIds", "0")]
    [InlineData("Ai:Fake:MismatchEveryNth", "-1")]
    public void Invalid_values_stop_startup_with_a_turkish_message(string key, string value)
    {
        Load(Gemini(v => v[key] = value), out var error);

        Assert.False(string.IsNullOrWhiteSpace(error));
        Assert.Contains("Ai", error);
    }

    [Fact]
    public void Loopback_http_base_url_is_allowed_for_test_servers()
    {
        Load(Gemini(v => v["Ai:Gemini:BaseUrl"] = "http://127.0.0.1:5999"), out var error);

        Assert.Null(error);
    }

    [Fact]
    public void Required_flag_demands_keys_and_gemini()
    {
        Load(Gemini(v => v["Ai:Required"] = "true"), out var missing);
        Load(Gemini(v => { v["Ai:Required"] = "true"; v["Ai:Gemini:QuestionApiKey"] = "q"; v["Ai:Gemini:SolutionApiKey"] = "s"; }), out var present);
        Load(new() { ["Ai:Required"] = "true" }, out var none);

        Assert.NotNull(missing);
        Assert.Null(present);
        Assert.NotNull(none);
    }

    [Fact]
    public void Provider_none_never_fails_validation_by_itself()
    {
        Load(new() { ["Ai:Provider"] = "None" }, out var error);

        Assert.Null(error);
    }

    [Fact]
    public void Unknown_provider_name_fails_binding()
    {
        Assert.ThrowsAny<Exception>(() => Load(new() { ["Ai:Provider"] = "Baska" }, out _));
    }

    [Fact]
    public void Pricing_lookup_is_case_insensitive_after_post_configure()
    {
        var options = Load(Gemini(v =>
        {
            v["Ai:Pricing:Gemini-3.8-Flash:InputPerMTokUsd"] = "0.75";
            v["Ai:Pricing:Gemini-3.8-Flash:OutputPerMTokUsd"] = "3.75";
        }), out var error);

        Assert.Null(error);
        Assert.True(options.Pricing.ContainsKey("gemini-3.8-flash"));
    }

    [Fact]
    public void Negative_pricing_is_rejected()
    {
        Load(Gemini(v => v["Ai:Pricing:m:InputPerMTokUsd"] = "-1"), out var error);

        Assert.NotNull(error);
    }

    [Fact]
    public void Price_changes_bind_from_configuration()
    {
        var options = Load(Gemini(v =>
        {
            v["Ai:Pricing:gemini-3.8-flash:InputPerMTokUsd"] = "0.75";
            v["Ai:Pricing:gemini-3.8-flash:OutputPerMTokUsd"] = "3.75";
            v["Ai:Pricing:gemini-3.8-flash:Changes:0:EffectiveFrom"] = "2027-01-01T00:00:00Z";
            v["Ai:Pricing:gemini-3.8-flash:Changes:0:InputPerMTokUsd"] = "1.50";
            v["Ai:Pricing:gemini-3.8-flash:Changes:0:OutputPerMTokUsd"] = "7.50";
        }), out var error);

        Assert.Null(error);
        var change = Assert.Single(options.Pricing["gemini-3.8-flash"].Changes);
        Assert.Equal(new DateTimeOffset(2027, 1, 1, 0, 0, 0, TimeSpan.Zero), change.EffectiveFrom);
        Assert.Equal(1.5m, change.InputPerMTokUsd);
        Assert.Equal(7.5m, change.OutputPerMTokUsd);
    }

    [Fact]
    public void Price_change_without_effective_date_is_rejected()
    {
        Load(Gemini(v =>
        {
            v["Ai:Pricing:m:Changes:0:InputPerMTokUsd"] = "1";
            v["Ai:Pricing:m:Changes:0:OutputPerMTokUsd"] = "2";
        }), out var error);

        Assert.NotNull(error);
    }

    [Fact]
    public void Negative_price_change_is_rejected()
    {
        Load(Gemini(v =>
        {
            v["Ai:Pricing:m:Changes:0:EffectiveFrom"] = "2027-01-01T00:00:00Z";
            v["Ai:Pricing:m:Changes:0:InputPerMTokUsd"] = "-1";
            v["Ai:Pricing:m:Changes:0:OutputPerMTokUsd"] = "2";
        }), out var error);

        Assert.NotNull(error);
    }

    [Fact]
    public void Duplicate_effective_dates_are_rejected()
    {
        Load(Gemini(v =>
        {
            v["Ai:Pricing:m:Changes:0:EffectiveFrom"] = "2027-01-01T00:00:00Z";
            v["Ai:Pricing:m:Changes:0:InputPerMTokUsd"] = "1";
            v["Ai:Pricing:m:Changes:0:OutputPerMTokUsd"] = "2";
            v["Ai:Pricing:m:Changes:1:EffectiveFrom"] = "2027-01-01T03:00:00+03:00";
            v["Ai:Pricing:m:Changes:1:InputPerMTokUsd"] = "3";
            v["Ai:Pricing:m:Changes:1:OutputPerMTokUsd"] = "4";
        }), out var error);

        Assert.NotNull(error);
        Assert.Contains("aynı EffectiveFrom", error);
    }

    [Theory]
    [InlineData("Input")]
    [InlineData("Output")]
    public void Price_change_missing_a_price_is_rejected(string present)
    {
        Load(Gemini(v =>
        {
            v["Ai:Pricing:m:Changes:0:EffectiveFrom"] = "2027-01-01T00:00:00Z";
            v[$"Ai:Pricing:m:Changes:0:{present}PerMTokUsd"] = "1";
        }), out var error);

        Assert.NotNull(error);
        Assert.Contains("belirtilmeli", error);
    }

    [Fact]
    public void Shipped_appsettings_are_valid_in_production_and_development()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "LGSApp.slnx")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        var api = Path.Combine(directory.FullName, "src", "LGSApp.Api");

        foreach (var environment in new[] { "Production", "Development" })
        {
            var builder = new ConfigurationBuilder()
                .AddJsonFile(Path.Combine(api, "appsettings.json"), optional: false)
                .AddJsonFile(Path.Combine(api, $"appsettings.{environment}.json"), optional: true);
            var services = new ServiceCollection();
            services.AddSingleton<IHostEnvironment>(new TestEnvironment(environment));
            var built = builder.Build();
            services.AddSingleton<IConfiguration>(built);
            services.AddAiOptions(built);
            using var provider = services.BuildServiceProvider();

            var options = provider.GetRequiredService<IOptions<AiOptions>>().Value;

            Assert.Equal(environment == "Development" ? AiProvider.Fake : AiProvider.Gemini, options.Provider);
            Assert.Equal("gemini-3.8-flash", options.Question.Model);
            Assert.Equal("gemini-3.8-flash", options.Solution.Model);
            Assert.Equal(0.75m, options.Pricing["gemini-3.8-flash"].InputPerMTokUsd);
            Assert.Equal(3.75m, options.Pricing["gemini-3.8-flash"].OutputPerMTokUsd);
            var change = Assert.Single(options.Pricing["gemini-3.8-flash"].Changes);
            Assert.Equal(new DateTimeOffset(2027, 1, 1, 0, 0, 0, TimeSpan.Zero), change.EffectiveFrom);
            Assert.Equal(1.5m, change.InputPerMTokUsd);
            Assert.Equal(7.5m, change.OutputPerMTokUsd);
            Assert.Empty(options.Gemini.QuestionApiKey);
            Assert.Empty(options.Gemini.SolutionApiKey);
        }
    }
}
