using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Ai;

namespace LGSApp.Tests.Ai;

public class AiSolveClassifierTests
{
    private static readonly string LongSolution = new('x', 80);

    private static AiSolveResult Result(
        bool readable = true,
        int answer = 2,
        string confidence = "high",
        string? solution = null,
        bool? agrees = null,
        AiErrorKind error = AiErrorKind.None) =>
        new(error, error == AiErrorKind.None ? null : "hata", readable, answer, confidence, solution ?? LongSolution, agrees,
            "m", "p", "{}", 1, 1, 1, 200, 1, 10, "v", null, "STOP");

    [Theory]
    [InlineData("high")]
    [InlineData("medium")]
    [InlineData("low")]
    public void Blind_matching_answer_is_accepted_regardless_of_confidence(string confidence)
    {
        var c = AiSolveClassifier.Classify(Result(answer: 2, confidence: confidence), AiSolveMode.Blind, 2);

        Assert.Equal(AiSolveOutcome.Accepted, c.Outcome);
        Assert.Equal(2, c.Option);
        Assert.StartsWith("Doğru cevap: B şıkkı.\n\n", c.SolutionText);
    }

    [Theory]
    [InlineData("high", AiSolveOutcome.Mismatch)]
    [InlineData("medium", AiSolveOutcome.Mismatch)]
    [InlineData("low", AiSolveOutcome.Unreliable)]
    public void Blind_different_answer_depends_on_confidence(string confidence, AiSolveOutcome expected)
    {
        var c = AiSolveClassifier.Classify(Result(answer: 3, confidence: confidence), AiSolveMode.Blind, 1);

        Assert.Equal(expected, c.Outcome);
        if (expected == AiSolveOutcome.Mismatch)
        {
            Assert.Equal(3, c.Option);
            Assert.StartsWith("Doğru cevap: C şıkkı.", c.SolutionText);
        }
    }

    [Theory]
    [InlineData(AiSolveMode.Blind)]
    [InlineData(AiSolveMode.Verified)]
    public void Unreadable_wins_over_everything(AiSolveMode mode)
    {
        var c = AiSolveClassifier.Classify(Result(readable: false, answer: 0, solution: ""), mode, 1);

        Assert.Equal(AiSolveOutcome.Unreadable, c.Outcome);
        Assert.Equal(AiErrorKind.Unreadable, c.ErrorKind);
    }

    [Theory]
    [InlineData(AiSolveMode.Blind)]
    [InlineData(AiSolveMode.Verified)]
    public void Readable_but_none_answer_is_unreliable(AiSolveMode mode)
    {
        var c = AiSolveClassifier.Classify(Result(answer: 0, agrees: true), mode, 1);

        Assert.Equal(AiSolveOutcome.Unreliable, c.Outcome);
    }

    [Theory]
    [InlineData(AiSolveMode.Blind)]
    [InlineData(AiSolveMode.Verified)]
    public void Short_solution_is_unreliable(AiSolveMode mode)
    {
        var c = AiSolveClassifier.Classify(Result(answer: 1, solution: "kısa", agrees: true), mode, 1);

        Assert.Equal(AiSolveOutcome.Unreliable, c.Outcome);
    }

    [Fact]
    public void Verified_agreeing_answer_is_accepted()
    {
        var c = AiSolveClassifier.Classify(Result(answer: 4, agrees: true), AiSolveMode.Verified, 4);

        Assert.Equal(AiSolveOutcome.Accepted, c.Outcome);
        Assert.False(c.KeyDisagreement);
    }

    [Theory]
    [InlineData(4, "high")]
    [InlineData(1, "high")]
    [InlineData(1, "low")]
    public void Verified_disagreement_is_never_a_mismatch(int answer, string confidence)
    {
        var c = AiSolveClassifier.Classify(Result(answer: answer, confidence: confidence, agrees: false), AiSolveMode.Verified, 4);

        Assert.Equal(AiSolveOutcome.Unreliable, c.Outcome);
        Assert.True(c.KeyDisagreement);
        Assert.Null(c.SolutionText);
    }

    [Fact]
    public void Verified_claiming_agreement_with_a_different_option_is_unreliable()
    {
        var c = AiSolveClassifier.Classify(Result(answer: 2, agrees: true), AiSolveMode.Verified, 4);

        Assert.Equal(AiSolveOutcome.Unreliable, c.Outcome);
        Assert.False(c.KeyDisagreement);
    }

    [Theory]
    [InlineData(AiErrorKind.Blocked)]
    [InlineData(AiErrorKind.Truncated)]
    [InlineData(AiErrorKind.InvalidOutput)]
    public void Content_failures_are_unreliable_and_keep_their_kind(AiErrorKind kind)
    {
        var c = AiSolveClassifier.Classify(Result(error: kind), AiSolveMode.Blind, 1);

        Assert.Equal(AiSolveOutcome.Unreliable, c.Outcome);
        Assert.Equal(kind, c.ErrorKind);
    }

    [Theory]
    [InlineData(AiErrorKind.RateLimited)]
    [InlineData(AiErrorKind.QuotaExhausted)]
    [InlineData(AiErrorKind.Unavailable)]
    [InlineData(AiErrorKind.Timeout)]
    [InlineData(AiErrorKind.AuthFailed)]
    [InlineData(AiErrorKind.InvalidRequest)]
    [InlineData(AiErrorKind.NotConfigured)]
    [InlineData(AiErrorKind.Canceled)]
    public void Provider_failures_are_not_classifiable(AiErrorKind kind)
    {
        Assert.True(kind.IsProviderFailure());
        Assert.Throws<ArgumentException>(() => AiSolveClassifier.Classify(Result(error: kind), AiSolveMode.Blind, 1));
    }

    [Fact]
    public void Text_is_capped_at_the_stored_maximum()
    {
        var c = AiSolveClassifier.Classify(Result(answer: 1, solution: new string('a', 9000)), AiSolveMode.Blind, 1);

        Assert.Equal(AiSolveOutcome.Accepted, c.Outcome);
        Assert.Equal(LGSApp.Domain.Constants.AiRules.SolutionMaxLength, c.SolutionText!.Length);
    }
}
