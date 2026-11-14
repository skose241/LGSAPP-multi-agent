using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Ai;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace LGSApp.Tests.Ai;

public class AiRegistrationTests
{
    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "LGSApp.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static ServiceProvider Build(string environment, Dictionary<string, string?> values)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new Env(environment));
        services.AddSingleton<IConfiguration>(configuration);
        services.AddSingleton(TimeProvider.System);
        services.AddAiOptions(configuration);
        services.AddAiServices(configuration);
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateOnBuild = false, ValidateScopes = true });
    }

    [Fact]
    public void Fake_provider_selects_fake_generator()
    {
        using var provider = Build("Development", new() { ["Ai:Provider"] = "Fake" });

        var generator = provider.GetRequiredService<IQuestionGenerator>();

        Assert.IsType<FakeQuestionGenerator>(generator);
        Assert.True(generator.IsConfigured);
    }

    [Theory]
    [InlineData("Gemini")]
    [InlineData("None")]
    public void Other_providers_fall_back_to_not_configured_until_gemini_generator_exists(string providerName)
    {
        using var provider = Build("Production", new() { ["Ai:Provider"] = providerName, ["Ai:Question:Model"] = "m", ["Ai:Solution:Model"] = "m" });

        var generator = provider.GetRequiredService<IQuestionGenerator>();

        Assert.IsType<NotConfiguredQuestionGenerator>(generator);
        Assert.False(generator.IsConfigured);
    }

    [Fact]
    public void Legacy_flag_selects_fake_generator()
    {
        using var provider = Build("Development", new() { ["Scheduler:UseFakeGenerator"] = "true" });

        Assert.IsType<FakeQuestionGenerator>(provider.GetRequiredService<IQuestionGenerator>());
    }

    [Fact]
    public void Gemini_client_and_cost_calculator_resolve()
    {
        using var provider = Build("Production", new() { ["Ai:Provider"] = "Gemini", ["Ai:Question:Model"] = "m", ["Ai:Solution:Model"] = "m" });

        Assert.IsType<GeminiRestClient>(provider.GetRequiredService<IGeminiClient>());
        Assert.NotNull(provider.GetRequiredService<AiCostCalculator>());
    }

    [Theory]
    [InlineData("Fake", "Development", "", typeof(FakeAiSolver), true)]
    [InlineData("None", "Production", "", typeof(NotConfiguredAiSolver), false)]
    [InlineData("Gemini", "Production", "", typeof(NotConfiguredAiSolver), false)]
    [InlineData("Gemini", "Production", "KEY", typeof(GeminiAiSolver), true)]
    public void Solver_selection_follows_provider_and_key(string providerName, string environment, string key, Type expected, bool configured)
    {
        var values = new Dictionary<string, string?> { ["Ai:Provider"] = providerName, ["Ai:Question:Model"] = "m", ["Ai:Solution:Model"] = "m" };
        if (key.Length > 0)
        {
            values["Ai:Gemini:SolutionApiKey"] = key;
        }

        using var provider = Build(environment, values);
        using var scope = provider.CreateScope();

        var solver = scope.ServiceProvider.GetRequiredService<IAiSolver>();

        Assert.IsType(expected, solver);
        Assert.Equal(configured, solver.IsConfigured);
    }
}
