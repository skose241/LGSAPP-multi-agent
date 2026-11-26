using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Reports;
using LGSApp.Infrastructure.Services.Scheduler;

namespace LGSApp.Tests.Ai;

public class ReportResolveRulesTests
{
    [Theory]
    [InlineData(ReportResolveAction.Reject, true, true)]
    [InlineData(ReportResolveAction.HideContent, true, true)]
    [InlineData(ReportResolveAction.ChangeAnswerKey, true, true)]
    [InlineData(ReportResolveAction.ChangeAnswerKey, false, true)]
    [InlineData(ReportResolveAction.Reject, false, false)]
    [InlineData(ReportResolveAction.HideContent, false, false)]
    [InlineData(ReportResolveAction.BanUser, true, false)]
    public void Question_reports_touch_answer_key_by_action(ReportResolveAction action, bool hasWrongKey, bool expected) =>
        Assert.Equal(expected, ReportResolveRules.TouchesAnswerKey(ReportTargetType.Question, action, hasWrongKey));

    [Theory]
    [InlineData(ReportTargetType.Comment)]
    [InlineData(ReportTargetType.Solution)]
    public void Non_question_targets_never_touch_answer_key(ReportTargetType target)
    {
        Assert.False(ReportResolveRules.TouchesAnswerKey(target, ReportResolveAction.HideContent, true));
        Assert.False(ReportResolveRules.TouchesAnswerKey(target, ReportResolveAction.Reject, true));
    }

    [Fact]
    public void Hide_with_wrong_key_blocks_teacher_of_other_or_no_branch_but_not_mudur_or_owner()
    {
        Assert.True(ReportResolveRules.TouchesAnswerKey(ReportTargetType.Question, ReportResolveAction.HideContent, true));

        var teacher = new Actor(2, Roles.Ogretmen);
        Assert.Equal(AnswerKeyScope.WrongBranchMessage, AnswerKeyScope.Authorize(teacher, 5, 7)!.Value.Message);
        Assert.Equal(AnswerKeyScope.NoBranchMessage, AnswerKeyScope.Authorize(teacher, null, 7)!.Value.Message);
        Assert.Null(AnswerKeyScope.Authorize(teacher, 7, 7));
        Assert.Null(AnswerKeyScope.Authorize(new Actor(1, Roles.Mudur), null, 7));
    }

    [Theory]
    [InlineData(GenerationKind.Generate, "Günlük soru üretimi görevi beklenmeyen bir hata nedeniyle tamamlanamadı.")]
    [InlineData(GenerationKind.Complete, "Günlük soru tamamlama görevi beklenmeyen bir hata nedeniyle tamamlanamadı.")]
    [InlineData(GenerationKind.Publish, "Günlük soru yayınlama görevi beklenmeyen bir hata nedeniyle tamamlanamadı.")]
    [InlineData(GenerationKind.CloseAssignments, "Ödev açma/kapatma görevi beklenmeyen bir hata nedeniyle tamamlanamadı.")]
    public void Run_failure_notice_names_job_without_raw_error(GenerationKind kind, string expected) =>
        Assert.Equal(expected, SchedulerMessages.RunFailureNotice(kind));

    [Fact]
    public void Interrupted_notice_depends_on_trigger()
    {
        var timer = SchedulerMessages.RunInterruptedNotice(GenerationKind.Publish, false, GenerationTrigger.Timer);
        var manual = SchedulerMessages.RunInterruptedNotice(GenerationKind.Publish, true, GenerationTrigger.Manual);

        Assert.Contains("Zamanlayıcı görevi yeniden deneyecektir", timer);
        Assert.DoesNotContain("yeniden deneyecektir", manual);
        Assert.Contains("uygulama yeniden başlatıldı", manual);
        Assert.Contains("Görevi zamanlayıcı ekranından yeniden başlatabilirsiniz.", manual);
    }
}
