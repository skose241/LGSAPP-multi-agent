using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Common;

namespace LGSApp.Tests.Questions;

public class HiddenQuestionOwnerViewTests
{
    private static QuestionAccessFacts Facts(int authorId, bool hidden) =>
        new(1, authorId, QuestionSource.Student, DateTime.UtcNow, hidden, null, null, false);

    [Fact]
    public void Hidden_question_gives_its_student_author_a_read_only_view()
    {
        var access = QuestionAccessService.Evaluate(Facts(10, true), new Actor(10, Roles.Ogrenci));

        Assert.True(access.IsHiddenOwnerView);
        Assert.False(access.IsVisible);
        Assert.False(access.CanAnswer);
        Assert.False(access.CanReport);
        Assert.False(access.CanSeeDiscussion);
        Assert.False(access.CanSeeOwnResult);
    }

    [Fact]
    public void Hidden_question_stays_invisible_to_other_students()
    {
        var access = QuestionAccessService.Evaluate(Facts(10, true), new Actor(11, Roles.Ogrenci));

        Assert.False(access.IsHiddenOwnerView);
        Assert.False(access.IsVisible);
    }

    [Fact]
    public void Visible_question_does_not_use_the_hidden_owner_view()
    {
        var access = QuestionAccessService.Evaluate(Facts(10, false), new Actor(10, Roles.Ogrenci));

        Assert.False(access.IsHiddenOwnerView);
        Assert.True(access.IsVisible);
    }

    [Fact]
    public void Moderators_see_hidden_questions_normally()
    {
        var access = QuestionAccessService.Evaluate(Facts(10, true), new Actor(2, Roles.Ogretmen));

        Assert.False(access.IsHiddenOwnerView);
        Assert.True(access.IsVisible);
    }
}
