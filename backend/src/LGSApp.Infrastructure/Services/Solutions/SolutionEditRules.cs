using LGSApp.Domain.Entities;

namespace LGSApp.Infrastructure.Services.Solutions;

public static class SolutionEditRules
{
    public const string PendingReportReason = "pendingReport";
    public const string PendingReportMessage = "Bu çözüm hakkında incelenen bir şikayet var; inceleme bitene kadar düzenlenemez.";

    public static bool IsOwnEditableStudentSolution(bool isStudent, bool isMine, SolutionType type, bool isDeleted, bool isHidden) =>
        isStudent && isMine && type == SolutionType.Student && !isDeleted && !isHidden;

    public static bool CanEdit(bool isStudent, bool isMine, SolutionType type, bool isDeleted, bool isHidden, bool hasPendingReport) =>
        IsOwnEditableStudentSolution(isStudent, isMine, type, isDeleted, isHidden) && !hasPendingReport;

    public static string? LockReason(bool isStudent, bool isMine, SolutionType type, bool isDeleted, bool isHidden, bool hasPendingReport) =>
        hasPendingReport && IsOwnEditableStudentSolution(isStudent, isMine, type, isDeleted, isHidden) ? PendingReportReason : null;
}
