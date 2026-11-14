namespace LGSApp.Domain.Constants;

public static class AiRules
{
    public const int ExplanationMinLength = 50;
    public const int ExplanationMaxLength = 1200;
    public const int ExplanationMaxWords = 200;
    public const int SolutionMinLength = 50;
    public const int SolutionMaxLength = 6000;
    public const int SolveMaxWords = 250;
    public const int RecentQuestionCount = 5;
    public const int RecentQuestionMaxChars = 180;
    public const int DistributionWindow = 20;
    public const double SimilarityThreshold = 0.6;
    public const int ShingleSize = 3;
    public const int LogInputMaxLength = 4000;
    public const int ErrorMessageMaxLength = 2000;
    public const int ModelVersionMaxLength = 80;
    public const int PendingOrphanMinutes = 10;
}
