namespace LGSApp.Domain.Constants;

public static class AssignmentRules
{
    public const int MaxRangeDays = 60;
    public const string FutureLimitMessage = "Ödev tarihleri bugünden en fazla 1 yıl sonrası olabilir.";
    public const int MaxBatchSize = 20;
    public const int MaxQuestionsPerAssignment = 200;
    public const int TitleMaxLength = 150;
    public const int DescriptionMaxLength = 1000;
    public const int QuestionTextMaxLength = 8000;
    public const int OptionMaxLength = 500;
    public const int QuestionDescriptionMaxLength = 2000;
    public const int MaxPageSize = 50;
}
