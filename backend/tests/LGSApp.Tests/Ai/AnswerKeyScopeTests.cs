using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Services.Common;

namespace LGSApp.Tests.Ai;

public class AnswerKeyScopeTests
{
    private static Actor Mudur => new(1, Roles.Mudur);
    private static Actor Teacher => new(2, Roles.Ogretmen);
    private static Actor Student => new(3, Roles.Ogrenci);

    [Theory]
    [InlineData(null)]
    [InlineData(5)]
    public void Mudur_is_allowed_for_every_lesson(int? branch) =>
        Assert.Null(AnswerKeyScope.Authorize(Mudur, branch, 7));

    [Fact]
    public void Teacher_with_matching_branch_is_allowed() =>
        Assert.Null(AnswerKeyScope.Authorize(Teacher, 7, 7));

    [Fact]
    public void Teacher_with_other_branch_gets_403_with_branch_message()
    {
        var failure = AnswerKeyScope.Authorize(Teacher, 5, 7);

        Assert.Equal(ServiceErrorKind.Forbidden, failure!.Value.Kind);
        Assert.Equal(AnswerKeyScope.WrongBranchMessage, failure.Value.Message);
    }

    [Fact]
    public void Teacher_without_branch_gets_403_with_no_branch_message()
    {
        var failure = AnswerKeyScope.Authorize(Teacher, null, 7);

        Assert.Equal(ServiceErrorKind.Forbidden, failure!.Value.Kind);
        Assert.Equal(AnswerKeyScope.NoBranchMessage, failure.Value.Message);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(7)]
    public void Student_is_never_allowed(int? branch)
    {
        var failure = AnswerKeyScope.Authorize(Student, branch, 7);

        Assert.Equal(ServiceErrorKind.Forbidden, failure!.Value.Kind);
    }

    [Fact]
    public void View_message_can_be_overridden_for_listing()
    {
        var failure = AnswerKeyScope.Authorize(Teacher, 5, 7, AnswerKeyScope.ViewWrongBranchMessage);

        Assert.Equal(AnswerKeyScope.ViewWrongBranchMessage, failure!.Value.Message);
    }

    [Fact]
    public void Messages_match_expected_turkish_text()
    {
        Assert.Equal("Yalnızca branş dersinizin sorularında bu işlemi yapabilirsiniz.", AnswerKeyScope.WrongBranchMessage);
        Assert.Equal("Hesabınıza branş dersi tanımlanmamış.", AnswerKeyScope.NoBranchMessage);
    }
}

public class AnswerKeyReviewNoteTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   \t ")]
    public void Blank_note_becomes_null(string? raw)
    {
        Assert.Null(AnswerKeyReviewNote.TryPrepare(raw, out var note));
        Assert.Null(note);
    }

    [Fact]
    public void Note_is_trimmed_and_composed_to_nfc()
    {
        Assert.Null(AnswerKeyReviewNote.TryPrepare("  çok iyi  ", out var note));

        Assert.Equal("çok iyi", note);
    }

    [Fact]
    public void Length_limit_is_applied_after_normalization()
    {
        var decomposed = string.Concat(Enumerable.Repeat("ç", AnswerKeyReviewNote.MaxLength));
        var exact = AnswerKeyReviewNote.TryPrepare(decomposed, out var note);
        var over = AnswerKeyReviewNote.TryPrepare(new string('a', AnswerKeyReviewNote.MaxLength + 1), out _);

        Assert.Null(exact);
        Assert.Equal(AnswerKeyReviewNote.MaxLength, note!.Length);
        Assert.Equal(ServiceErrorKind.Validation, over!.Value.Kind);
    }

    [Theory]
    [InlineData("a\u0007b")]
    [InlineData("a\u0000b")]
    public void Control_characters_are_rejected(string raw)
    {
        var failure = AnswerKeyReviewNote.TryPrepare(raw, out var note);

        Assert.Equal(ServiceErrorKind.Validation, failure!.Value.Kind);
        Assert.Null(note);
    }

    [Fact]
    public void Lone_surrogates_are_rejected()
    {
        var failure = AnswerKeyReviewNote.TryPrepare("bozuk" + (char)0xD800, out var note);

        Assert.Equal(ServiceErrorKind.Validation, failure!.Value.Kind);
        Assert.Null(note);
    }

    [Fact]
    public void Newlines_and_tabs_are_allowed()
    {
        Assert.Null(AnswerKeyReviewNote.TryPrepare("a\nb\tc", out var note));

        Assert.Equal("a\nb\tc", note);
    }
}
