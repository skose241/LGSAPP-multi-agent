using System.Text;
using LGSApp.Domain.Constants;

namespace LGSApp.Infrastructure.Services.Scheduler;

public static class SlotPlanner
{
    public const int AbsoluteMaxSlots = 20;

    public static int Target(byte? planTarget, int scheduleCount, int multiplier, int maxSlots)
    {
        var cap = Math.Clamp(maxSlots, 0, AbsoluteMaxSlots);
        var target = planTarget is { } explicitTarget
            ? explicitTarget
            : (int)Math.Ceiling((double)Math.Max(0, scheduleCount) * Math.Max(0, multiplier));
        return Math.Clamp(target, 0, cap);
    }

    public static IReadOnlyList<byte> MissingSlots(int target, IEnumerable<byte> existing)
    {
        var taken = existing.ToHashSet();
        var result = new List<byte>();
        for (var slot = 1; slot <= target; slot++)
        {
            if (!taken.Contains((byte)slot))
            {
                result.Add((byte)slot);
            }
        }

        return result;
    }
}

public enum TopicSource
{
    None = 0,
    Today = 1,
    Plan = 2,
    LastUsed = 3,
    First = 4
}

public sealed record TopicChoice(int? TopicId, TopicSource Source);

public static class TopicResolver
{
    public static TopicChoice Resolve(int? todayTopicId, int? planTopicId, int? lastUsedTopicId, int? firstActiveTopicId)
    {
        if (todayTopicId is { } today)
        {
            return new TopicChoice(today, TopicSource.Today);
        }

        if (planTopicId is { } plan)
        {
            return new TopicChoice(plan, TopicSource.Plan);
        }

        if (lastUsedTopicId is { } last)
        {
            return new TopicChoice(last, TopicSource.LastUsed);
        }

        if (firstActiveTopicId is { } first)
        {
            return new TopicChoice(first, TopicSource.First);
        }

        return new TopicChoice(null, TopicSource.None);
    }
}

public sealed record ValidatedQuestion(
    string Text,
    string OptionA,
    string OptionB,
    string OptionC,
    string OptionD,
    byte CorrectOption,
    string Explanation);

public static class AiQuestionValidator
{
    public const int ExplanationMinLength = 50;

    public static string Letter(int option) => ((char)('A' + option - 1)).ToString();

    public static string BuildSolutionText(int option, string explanation) =>
        $"Doğru cevap: {Letter(option)} şıkkı.\n\n{explanation}";

    public static (ValidatedQuestion? Value, string? Error) Validate(QuestionGenerationResult result)
    {
        var text = Clean(result.Text);
        if (text.Length == 0)
        {
            return (null, "Soru metni boş.");
        }

        if (text.Length > AssignmentRules.QuestionTextMaxLength)
        {
            return (null, "Soru metni çok uzun.");
        }

        var options = new[] { Clean(result.OptionA), Clean(result.OptionB), Clean(result.OptionC), Clean(result.OptionD) };
        if (options.Any(o => o.Length == 0))
        {
            return (null, "Şıklardan en az biri boş.");
        }

        if (options.Any(o => o.Length > AssignmentRules.OptionMaxLength))
        {
            return (null, "Şıklardan en az biri çok uzun.");
        }

        if (result.CorrectOption is < 1 or > 4)
        {
            return (null, "Doğru cevap A-D aralığında değil.");
        }

        var explanation = Clean(result.Explanation);
        if (explanation.Length < ExplanationMinLength)
        {
            return (null, "Açıklama yetersiz.");
        }

        return (new ValidatedQuestion(text, options[0], options[1], options[2], options[3], (byte)result.CorrectOption, explanation), null);
    }

    private static string Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Normalize(NormalizationForm.FormC).Trim();
}
