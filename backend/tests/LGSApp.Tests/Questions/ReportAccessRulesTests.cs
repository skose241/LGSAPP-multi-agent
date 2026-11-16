using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Assignments;
using LGSApp.Infrastructure.Services.Common;

namespace LGSApp.Tests.Questions;

public class ReportAccessRulesTests
{
    private static QuestionAccessFacts Facts(
        int authorId = 10,
        bool hidden = false,
        DateTime? publishedAt = null,
        AssignmentEffectiveState? state = null,
        bool answered = false) =>
        new(1, authorId, QuestionSource.Student, publishedAt ?? DateTime.UtcNow, hidden, state is null ? null : 5, state, answered);

    private static readonly Actor Student = new(11, Roles.Ogrenci);

    [Fact]
    public void Unanswered_published_question_can_be_reported_without_exposing_results()
    {
        var access = QuestionAccessService.Evaluate(Facts(), Student);

        Assert.True(access.CanReport);
        Assert.False(access.CanSeeOwnResult);
        Assert.False(access.CanSeeDiscussion);
    }

    [Fact]
    public void Unanswered_question_in_an_open_assignment_can_be_reported_without_exposing_results()
    {
        var access = QuestionAccessService.Evaluate(Facts(state: AssignmentEffectiveState.Open), Student);

        Assert.True(access.CanReport);
        Assert.False(access.CanSeeOwnResult);
        Assert.False(access.CanSeeDiscussion);
    }

    [Fact]
    public void Own_hidden_moderator_and_unpublished_cases_cannot_report()
    {
        Assert.False(QuestionAccessService.Evaluate(Facts(authorId: 11), Student).CanReport);
        Assert.False(QuestionAccessService.Evaluate(Facts(hidden: true), Student).CanReport);
        Assert.False(QuestionAccessService.Evaluate(Facts(state: AssignmentEffectiveState.Scheduled), Student).CanReport);
        Assert.False(QuestionAccessService.Evaluate(Facts(), new Actor(2, Roles.Ogretmen)).CanReport);
    }
}
