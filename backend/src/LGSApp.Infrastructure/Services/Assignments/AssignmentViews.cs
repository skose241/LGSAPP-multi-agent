using LGSApp.Infrastructure.Services.Files;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Questions;

namespace LGSApp.Infrastructure.Services.Assignments;

public sealed record AssignmentTeacherRefView(int Id, string UserName, string? FullName);

public sealed record AssignmentManageItemView(
    int Id,
    string Title,
    string? Description,
    LessonRefView Lesson,
    AssignmentTeacherRefView Teacher,
    DateOnly StartDate,
    DateOnly EndDate,
    AssignmentEffectiveState State,
    int QuestionCount,
    int ParticipantCount,
    DateTime? PublishedAt,
    DateTime? ClosedAt,
    DateTime CreatedAt,
    bool CanModify,
    byte[] RowVersion);

public sealed record AssignmentManageListView(int Page, int PageSize, int TotalCount, IReadOnlyList<AssignmentManageItemView> Items);

public sealed record OptionDistributionView(int A, int B, int C, int D);

public sealed record AssignmentQuestionManageView(
    int Id,
    int OrderNo,
    string? Text,
    int? ImageFileId,
    ImageView? Image,
    QuestionOptionsView Options,
    byte CorrectOption,
    TopicRefView? Topic,
    string? Description,
    QuestionSource Source,
    bool CreatedForAssignment,
    bool IsHidden,
    bool IsEditable,
    int AnswerCount,
    int CorrectCount,
    OptionDistributionView Distribution,
    byte[] RowVersion);

public sealed record AssignmentManageDetailView(
    int Id,
    string Title,
    string? Description,
    LessonRefView Lesson,
    AssignmentTeacherRefView Teacher,
    DateOnly StartDate,
    DateOnly EndDate,
    AssignmentEffectiveState State,
    int ParticipantCount,
    DateTime? PublishedAt,
    DateTime? ClosedAt,
    DateTime CreatedAt,
    bool CanModify,
    byte[] RowVersion,
    IReadOnlyList<AssignmentQuestionManageView> Questions);

public sealed record AddedQuestionView(int Id, int OrderNo, byte[] RowVersion);

public sealed record AddedQuestionsView(int AddedCount, int TotalCount, IReadOnlyList<AddedQuestionView> Items);

public sealed record AssignmentChangeView(int Id, AssignmentEffectiveState State, AssignmentStatus Status, DateTime? PublishedAt, int? NotifiedCount, byte[] RowVersion);

public sealed record AssignmentStudentRowView(
    int UserId,
    string UserName,
    string? FullName,
    int AnsweredCount,
    int CorrectCount,
    int TotalQuestions,
    double CompletionRate,
    DateTime? LastAnsweredAt);

public sealed record AssignmentQuestionResultView(
    int Id,
    int OrderNo,
    byte CorrectOption,
    int AnswerCount,
    int CorrectCount,
    double CorrectRate,
    OptionDistributionView Distribution);

public sealed record AssignmentResultsView(
    int AssignmentId,
    string Title,
    AssignmentEffectiveState State,
    int TotalQuestions,
    int TotalStudents,
    int ParticipantCount,
    int CompletedCount,
    int PartialCount,
    int MissedCount,
    int NotStartedCount,
    int Page,
    int PageSize,
    IReadOnlyList<AssignmentStudentRowView> Students,
    IReadOnlyList<AssignmentQuestionResultView> Questions);

public sealed record AssignmentStudentListItemView(
    int Id,
    string Title,
    LessonRefView Lesson,
    string TeacherUserName,
    DateOnly StartDate,
    DateOnly EndDate,
    AssignmentEffectiveState State,
    int TotalQuestions,
    int MyAnsweredCount,
    int MyCorrectCount);

public sealed record AssignmentStudentListView(int Page, int PageSize, int TotalCount, IReadOnlyList<AssignmentStudentListItemView> Items);

public sealed record AssignmentMyAnswerView(byte SelectedOption, bool IsCorrect, byte CorrectOption, DateTime AnsweredAt);

public sealed record AssignmentStudentQuestionView(
    int Id,
    int OrderNo,
    string? Text,
    int? ImageFileId,
    ImageView? Image,
    QuestionOptionsView Options,
    AssignmentMyAnswerView? MyAnswer,
    byte? CorrectOption,
    bool CanAnswer,
    bool CanSeeDiscussion);

public sealed record AssignmentStudentDetailView(
    int Id,
    string Title,
    string? Description,
    LessonRefView Lesson,
    string TeacherUserName,
    DateOnly StartDate,
    DateOnly EndDate,
    AssignmentEffectiveState State,
    int TotalQuestions,
    int MyAnsweredCount,
    int MyCorrectCount,
    IReadOnlyList<AssignmentStudentQuestionView> Questions);
