using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Ai;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Scheduler;

namespace LGSApp.Tests.Ai;

public class AnswerDisputeRulesTests
{
    private static readonly DateTime Now = new(2026, 11, 14, 12, 0, 0, DateTimeKind.Utc);

    private static Solution AiSolution(byte? stated, bool hidden) =>
        new() { Type = SolutionType.Ai, StatedOption = stated, IsHidden = hidden };

    [Theory]
    [InlineData(2, 2, AiSolutionKeyDecision.Publish)]
    [InlineData(2, 3, AiSolutionKeyDecision.Remove)]
    [InlineData(null, 3, AiSolutionKeyDecision.Remove)]
    public void Decide_compares_stated_option_with_new_key(int? stated, int key, AiSolutionKeyDecision expected) =>
        Assert.Equal(expected, AnswerKeyAiSolutionRules.Decide((byte?)stated, (byte)key));

    [Fact]
    public void Disputed_hidden_solution_is_published_when_key_matches()
    {
        var solution = AiSolution(2, true);

        var decision = AnswerKeyAiSolutionRules.Apply(solution, 2, true, Now);

        Assert.Equal(AiSolutionKeyDecision.Publish, decision);
        Assert.False(solution.IsHidden);
        Assert.False(solution.IsDeleted);
        Assert.Equal(Now, solution.UpdatedAt);
    }

    [Fact]
    public void Moderator_hidden_solution_stays_hidden_when_not_disputed()
    {
        var solution = AiSolution(2, true);

        AnswerKeyAiSolutionRules.Apply(solution, 2, false, Now);

        Assert.True(solution.IsHidden);
        Assert.False(solution.IsDeleted);
        Assert.Null(solution.UpdatedAt);
    }

    [Fact]
    public void Visible_solution_with_matching_key_is_untouched()
    {
        var solution = AiSolution(1, false);

        AnswerKeyAiSolutionRules.Apply(solution, 1, false, Now);

        Assert.False(solution.IsHidden);
        Assert.False(solution.IsDeleted);
        Assert.Null(solution.UpdatedAt);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Solution_with_different_option_is_soft_deleted(bool hidden)
    {
        var solution = AiSolution(1, hidden);

        var decision = AnswerKeyAiSolutionRules.Apply(solution, 4, hidden, Now);

        Assert.Equal(AiSolutionKeyDecision.Remove, decision);
        Assert.True(solution.IsDeleted);
        Assert.Equal(Now, solution.UpdatedAt);
    }

    [Fact]
    public void Dismiss_deletes_only_hidden_live_ai_solutions()
    {
        Assert.True(AnswerKeyAiSolutionRules.ShouldDeleteOnDismiss(AiSolution(2, true)));
        Assert.False(AnswerKeyAiSolutionRules.ShouldDeleteOnDismiss(AiSolution(2, false)));
        Assert.False(AnswerKeyAiSolutionRules.ShouldDeleteOnDismiss(
            new Solution { Type = SolutionType.Ai, IsHidden = true, IsDeleted = true }));
        Assert.False(AnswerKeyAiSolutionRules.ShouldDeleteOnDismiss(
            new Solution { Type = SolutionType.Teacher, IsHidden = true }));
    }

    [Theory]
    [InlineData(null)]
    [InlineData(new byte[0])]
    public void Dismiss_requires_row_version(byte[]? rowVersion)
    {
        var result = DismissDisputeRules.Validate(new DismissDisputeCommand(rowVersion, null));

        Assert.Equal(ServiceErrorKind.Validation, result.Error);
        Assert.Equal(DismissDisputeRules.RowVersionRequiredMessage, result.Message);
    }

    [Fact]
    public void Dismiss_trims_note_and_turns_blank_into_null()
    {
        var trimmed = DismissDisputeRules.Validate(new DismissDisputeCommand([1], "  anahtar doğru  "));
        var blank = DismissDisputeRules.Validate(new DismissDisputeCommand([1], "   "));

        Assert.Equal("anahtar doğru", trimmed.Value!.Note);
        Assert.Null(blank.Value!.Note);
    }

    [Fact]
    public void Dismiss_rejects_long_note_and_control_characters()
    {
        var tooLong = DismissDisputeRules.Validate(new DismissDisputeCommand([1], new string('a', DismissDisputeRules.NoteMaxLength + 1)));
        var control = DismissDisputeRules.Validate(new DismissDisputeCommand([1], "a\u0007b"));
        var exact = DismissDisputeRules.Validate(new DismissDisputeCommand([1], new string('a', DismissDisputeRules.NoteMaxLength)));

        Assert.Equal(ServiceErrorKind.Validation, tooLong.Error);
        Assert.Equal(ServiceErrorKind.Validation, control.Error);
        Assert.True(exact.Succeeded);
    }

    [Fact]
    public void Unexpected_error_message_is_a_fixed_text_without_exception_details()
    {
        var exception = new InvalidOperationException("Cannot open server 'secret' connection string");

        Assert.Equal("Beklenmeyen bir hata oluştu.", SchedulerMessages.UnexpectedError);
        Assert.DoesNotContain(exception.Message, SchedulerMessages.UnexpectedError);
    }
}
