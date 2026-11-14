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

    private sealed class NoSettings : LGSApp.Infrastructure.Services.Settings.ISettingsService
    {
        public Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default) => Task.FromResult(0);

        public void Invalidate()
        {
        }
    }

    private static ServiceProvider Build(string environment, Dictionary<string, string?> values)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new Env(environment));
        services.AddSingleton<IConfiguration>(configuration);
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<LGSApp.Infrastructure.Services.Settings.ISettingsService, NoSettings>();
        services.AddAiOptions(configuration);
        services.AddAiServices(configuration);
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateOnBuild = false, ValidateScopes = true });
    }

    [Fact]
    public void Fake_provider_selects_fake_generator()
    {
        using var provider = Build("Development", new() { ["Ai:Provider"] = "Fake" });

        using var scope = provider.CreateScope();
        var generator = scope.ServiceProvider.GetRequiredService<IQuestionGenerator>();

        Assert.IsType<FakeQuestionGenerator>(generator);
        Assert.True(generator.IsConfigured);
    }

    [Theory]
    [InlineData("Gemini", "", typeof(NotConfiguredQuestionGenerator), false)]
    [InlineData("None", "KEY", typeof(NotConfiguredQuestionGenerator), false)]
    [InlineData("Gemini", "KEY", typeof(GeminiQuestionGenerator), true)]
    public void Question_generator_selection_follows_provider_and_key(string providerName, string key, Type expected, bool configured)
    {
        var values = new Dictionary<string, string?> { ["Ai:Provider"] = providerName, ["Ai:Question:Model"] = "m", ["Ai:Solution:Model"] = "m" };
        if (key.Length > 0)
        {
            values["Ai:Gemini:QuestionApiKey"] = key;
        }

        using var provider = Build("Production", values);
        using var scope = provider.CreateScope();

        var generator = scope.ServiceProvider.GetRequiredService<IQuestionGenerator>();

        Assert.IsType(expected, generator);
        Assert.Equal(configured, generator.IsConfigured);
    }

    [Fact]
    public void Verifier_resolves_in_scope()
    {
        using var provider = Build("Production", new() { ["Ai:Provider"] = "Gemini", ["Ai:Question:Model"] = "m", ["Ai:Solution:Model"] = "m" });
        using var scope = provider.CreateScope();

        Assert.IsType<QuestionVerifier>(scope.ServiceProvider.GetRequiredService<IQuestionVerifier>());
    }

    [Fact]
    public void Legacy_flag_selects_fake_generator()
    {
        using var provider = Build("Development", new() { ["Scheduler:UseFakeGenerator"] = "true" });
        using var scope = provider.CreateScope();

        Assert.IsType<FakeQuestionGenerator>(scope.ServiceProvider.GetRequiredService<IQuestionGenerator>());
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
