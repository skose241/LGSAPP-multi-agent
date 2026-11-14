using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Solutions;

namespace LGSApp.Tests.Solutions;

public class SolutionEditRulesTests
{
    [Fact]
    public void Own_visible_student_solution_without_a_report_is_editable()
    {
        Assert.True(SolutionEditRules.CanEdit(true, true, SolutionType.Student, false, false, false));
        Assert.Null(SolutionEditRules.LockReason(true, true, SolutionType.Student, false, false, false));
    }

    [Fact]
    public void Pending_report_locks_editing_and_reports_the_reason()
    {
        Assert.False(SolutionEditRules.CanEdit(true, true, SolutionType.Student, false, false, true));
        Assert.Equal("pendingReport", SolutionEditRules.LockReason(true, true, SolutionType.Student, false, false, true));
    }

    [Fact]
    public void Lock_reason_is_only_shown_to_the_owner_of_an_editable_student_solution()
    {
        Assert.Null(SolutionEditRules.LockReason(true, false, SolutionType.Student, false, false, true));
        Assert.Null(SolutionEditRules.LockReason(false, true, SolutionType.Teacher, false, false, true));
        Assert.Null(SolutionEditRules.LockReason(true, true, SolutionType.Student, false, true, true));
        Assert.Null(SolutionEditRules.LockReason(true, true, SolutionType.Student, true, false, true));
    }

    [Theory]
    [InlineData(false, true, SolutionType.Student, false, false)]
    [InlineData(true, false, SolutionType.Student, false, false)]
    [InlineData(true, true, SolutionType.Teacher, false, false)]
    [InlineData(true, true, SolutionType.Ai, false, false)]
    [InlineData(true, true, SolutionType.Student, true, false)]
    [InlineData(true, true, SolutionType.Student, false, true)]
    public void Only_own_visible_student_solutions_are_editable_by_students(bool isStudent, bool isMine, SolutionType type, bool deleted, bool hidden)
    {
        Assert.False(SolutionEditRules.CanEdit(isStudent, isMine, type, deleted, hidden, false));
    }

    [Fact]
    public void Lock_message_is_turkish_and_explains_the_wait()
    {
        Assert.Contains("şikayet", SolutionEditRules.PendingReportMessage);
        Assert.Contains("inceleme bitene kadar", SolutionEditRules.PendingReportMessage);
    }
}
