using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Questions;

namespace LGSApp.Tests.Questions;

public class QuestionPoolRulesTests
{
    [Theory]
    [InlineData(0, 20, 1, 20)]
    [InlineData(-5, 20, 1, 20)]
    [InlineData(3, 0, 3, 1)]
    [InlineData(2, 500, 2, 50)]
    [InlineData(1, 50, 1, 50)]
    public void Paging_is_normalized(int page, int pageSize, int expectedPage, int expectedSize)
    {
        Assert.Equal((expectedPage, expectedSize), QuestionPoolRules.NormalizePaging(page, pageSize));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   \n\t ")]
    public void Blank_text_has_no_preview(string? text)
    {
        Assert.Null(QuestionPoolRules.Preview(text));
    }

    [Fact]
    public void Short_text_is_returned_with_collapsed_whitespace()
    {
        Assert.Equal("Bir iki üç", QuestionPoolRules.Preview("  Bir   iki\n\nüç  "));
    }

    [Fact]
    public void Text_of_exactly_the_limit_is_not_truncated()
    {
        var text = new string('a', QuestionPoolRules.PreviewLength);

        Assert.Equal(text, QuestionPoolRules.Preview(text));
    }

    [Fact]
    public void Long_text_is_cut_to_the_limit_with_an_ellipsis()
    {
        var preview = QuestionPoolRules.Preview(new string('b', 500))!;

        Assert.Equal(QuestionPoolRules.PreviewLength + 1, preview.Length);
        Assert.EndsWith("…", preview);
    }

    [Fact]
    public void Cut_never_splits_a_surrogate_pair()
    {
        var text = new string('c', QuestionPoolRules.PreviewLength - 1) + "😀" + new string('d', 50);

        var preview = QuestionPoolRules.Preview(text)!;

        Assert.False(char.IsHighSurrogate(preview[^2]));
        Assert.Equal(QuestionPoolRules.PreviewLength, preview.Length);
    }

    [Theory]
    [InlineData(false, false, false, false)]
    [InlineData(true, false, false, true)]
    [InlineData(false, true, false, true)]
    [InlineData(false, false, true, true)]
    public void Correct_option_and_discussion_stats_follow_the_discussion_rule(bool moderator, bool owner, bool answered, bool expected)
    {
        Assert.Equal(expected, QuestionPoolRules.ShowCorrectOption(moderator, owner, answered));
        Assert.Equal(expected, QuestionPoolRules.ShowDiscussionStats(moderator, owner, answered));
    }

    [Fact]
    public void Valid_student_filters_pass()
    {
        Assert.Empty(QuestionPoolRules.ValidateFilters(true, QuestionSource.Ai, true, 7, false, false));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(91)]
    [InlineData(-1)]
    public void Since_outside_the_range_is_rejected(int since)
    {
        Assert.Contains("since", QuestionPoolRules.ValidateFilters(true, null, null, since, false, false).Keys);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(90)]
    public void Since_boundaries_are_accepted(int since)
    {
        Assert.Empty(QuestionPoolRules.ValidateFilters(true, null, null, since, false, false));
    }

    [Fact]
    public void Undefined_source_is_rejected()
    {
        Assert.Contains("source", QuestionPoolRules.ValidateFilters(true, (QuestionSource)9, null, null, false, false).Keys);
    }

    [Fact]
    public void Students_cannot_use_moderator_filters()
    {
        var errors = QuestionPoolRules.ValidateFilters(true, null, null, null, true, true);

        Assert.Contains("includeHidden", errors.Keys);
        Assert.Contains("scheduled", errors.Keys);
    }

    [Fact]
    public void Moderators_cannot_use_the_answered_filter_but_can_use_the_others()
    {
        Assert.Contains("answered", QuestionPoolRules.ValidateFilters(false, null, false, null, false, false).Keys);
        Assert.Empty(QuestionPoolRules.ValidateFilters(false, QuestionSource.Student, null, 30, true, false));
        Assert.Empty(QuestionPoolRules.ValidateFilters(false, null, null, null, false, true));
    }
}
