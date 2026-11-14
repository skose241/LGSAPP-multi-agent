using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.Extensions.Time.Testing;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Ai;

public class FakeQuestionGeneratorTests
{
    private static FakeQuestionGenerator Create(string failSlots, string failKind) =>
        new(Options.Create(new AiOptions { Provider = AiProvider.Fake, Fake = new AiFakeOptions { FailSlots = failSlots, FailErrorKind = failKind } }), new FakeTimeProvider());

    private static QuestionGenerationRequest Request(int attempt) => new(1, "Matematik", 2, "Konu", 1, attempt, []);

    [Fact]
    public async Task Fail_kind_quota_simulates_daily_quota_on_first_attempt_only()
    {
        var generator = Create("1", "QuotaExhausted");

        var first = await generator.GenerateAsync(Request(1), CancellationToken.None);
        var second = await generator.GenerateAsync(Request(2), CancellationToken.None);

        Assert.False(first.Succeeded);
        Assert.Equal(AiErrorKind.QuotaExhausted, first.ErrorKind);
        Assert.Equal(SchedulerMessages.AiQuotaExhausted, first.Error);
        Assert.True(second.Succeeded);
    }

    [Fact]
    public async Task Without_fail_kind_failure_is_transient_with_no_kind()
    {
        var result = await Create("1", string.Empty).GenerateAsync(Request(1), CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal(AiErrorKind.None, result.ErrorKind);
        Assert.True(result.IsTransient);
    }

    [Theory]
    [InlineData("", true)]
    [InlineData("QuotaExhausted", true)]
    [InlineData("authfailed", true)]
    [InlineData("None", false)]
    [InlineData("Nope", false)]
    [InlineData("3", false)]
    public void Fail_kind_validation(string value, bool valid)
    {
        Assert.Equal(valid, new AiFakeOptions { FailErrorKind = value }.FailErrorKindValid);
    }
}
