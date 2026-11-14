using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;

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

public sealed record QuestionValidation(ValidatedQuestion? Value, string? Error, IReadOnlyList<string> Warnings);

public static class AnswerBalancer
{
    public static int PickTarget(IReadOnlyList<int> recentCorrectNewestFirst, int fallback)
    {
        var window = recentCorrectNewestFirst.Where(o => o is >= 1 and <= 4).Take(AiRules.DistributionWindow).ToList();
        if (window.Count == 0)
        {
            return fallback is >= 1 and <= 4 ? fallback : 1;
        }

        var best = 0;
        var bestCount = int.MaxValue;
        var bestLastSeen = -1;
        for (var option = 1; option <= 4; option++)
        {
            var count = window.Count(o => o == option);
            var index = window.IndexOf(option);
            var lastSeen = index < 0 ? int.MaxValue : index;
            if (count < bestCount || (count == bestCount && lastSeen > bestLastSeen))
            {
                best = option;
                bestCount = count;
                bestLastSeen = lastSeen;
            }
        }

        return best;
    }
}

public static partial class TextSimilarity
{
    private static readonly CultureInfo Turkish = CultureInfo.GetCultureInfo("tr-TR");

    [GeneratedRegex(@"[\p{L}\p{N}]+")]
    private static partial Regex WordRegex();

    public static string Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : string.Join(' ', value.Normalize(NormalizationForm.FormC).ToLower(Turkish).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    public static IReadOnlySet<string> Shingles(string? text)
    {
        var words = WordRegex().Matches(Normalize(text)).Select(m => m.Value).ToList();
        var set = new HashSet<string>(StringComparer.Ordinal);
        if (words.Count == 0)
        {
            return set;
        }

        if (words.Count < AiRules.ShingleSize)
        {
            set.Add(string.Join(' ', words));
            return set;
        }

        for (var i = 0; i + AiRules.ShingleSize <= words.Count; i++)
        {
            set.Add(string.Join(' ', words.Skip(i).Take(AiRules.ShingleSize)));
        }

        return set;
    }

    public static double Jaccard(string? a, string? b)
    {
        var left = Shingles(a);
        var right = Shingles(b);
        if (left.Count == 0 || right.Count == 0)
        {
            return 0;
        }

        var intersection = left.Count(right.Contains);
        var union = left.Count + right.Count - intersection;
        return union == 0 ? 0 : (double)intersection / union;
    }
}

public sealed class GenerationCircuitBreaker
{
    public AiErrorKind? Kind { get; private set; }

    public bool Tripped => Kind is not null;

    public string? Message => Kind is { } kind ? SchedulerMessages.ForErrorKind(kind, null) : null;

    public static bool Trips(AiErrorKind kind) =>
        kind is AiErrorKind.QuotaExhausted or AiErrorKind.AuthFailed or AiErrorKind.NotConfigured;

    public void Observe(AiErrorKind kind)
    {
        if (Kind is null && Trips(kind))
        {
            Kind = kind;
        }
    }
}

public static partial class AiQuestionValidator
{
    public const int ExplanationMinLength = 50;

    public const string TooSimilarMessage = "Son sorulara çok benzer.";

    [GeneratedRegex(@"(\*\*|```|^\s*#)", RegexOptions.Multiline)]
    private static partial Regex MarkdownRegex();

    public static string Letter(int option) => ((char)('A' + option - 1)).ToString();

    public static string BuildSolutionText(int option, string explanation) =>
        $"Doğru cevap: {Letter(option)} şıkkı.\n\n{explanation}";

    public static (ValidatedQuestion? Value, string? Error) Validate(QuestionGenerationResult result)
    {
        var check = Check(result, null, null);
        return (check.Value, check.Error);
    }

    public static QuestionValidation Check(QuestionGenerationResult result, IReadOnlyList<string>? recentFullTexts, string? expectedTopic)
    {
        QuestionValidation Reject(string error) => new(null, error, []);

        var text = Clean(result.Text);
        if (text.Length == 0)
        {
            return Reject("Soru metni boş.");
        }

        if (text.Length > AssignmentRules.QuestionTextMaxLength)
        {
            return Reject("Soru metni çok uzun.");
        }

        var options = new[] { Clean(result.OptionA), Clean(result.OptionB), Clean(result.OptionC), Clean(result.OptionD) };
        if (options.Any(o => o.Length == 0))
        {
            return Reject("Şıklardan en az biri boş.");
        }

        if (options.Any(o => o.Length > AssignmentRules.OptionMaxLength))
        {
            return Reject("Şıklardan en az biri çok uzun.");
        }

        if (options.Select(TextSimilarity.Normalize).Distinct(StringComparer.Ordinal).Count() != options.Length)
        {
            return Reject("Şıklardan en az ikisi aynı.");
        }

        if (result.CorrectOption is < 1 or > 4)
        {
            return Reject("Doğru cevap A-D aralığında değil.");
        }

        var explanation = Clean(result.Explanation);
        if (explanation.Length < ExplanationMinLength)
        {
            return Reject("Açıklama yetersiz.");
        }

        if (MarkdownRegex().IsMatch(text) || options.Any(MarkdownRegex().IsMatch) || MarkdownRegex().IsMatch(explanation))
        {
            return Reject("Metinde markdown biçimlendirmesi var.");
        }

        if (recentFullTexts is not null
            && recentFullTexts.Take(AiRules.RecentQuestionCount).Any(r => TextSimilarity.Jaccard(text, r) >= AiRules.SimilarityThreshold))
        {
            return Reject(TooSimilarMessage);
        }

        var warnings = new List<string>();
        if (!string.IsNullOrWhiteSpace(expectedTopic) && !string.IsNullOrWhiteSpace(result.Topic))
        {
            var expected = TextSimilarity.Normalize(expectedTopic);
            var actual = TextSimilarity.Normalize(result.Topic);
            if (!expected.Contains(actual, StringComparison.Ordinal) && !actual.Contains(expected, StringComparison.Ordinal))
            {
                warnings.Add($"Model konu olarak '{actual}' döndürdü; istenen '{expected}'.");
            }
        }

        return new QuestionValidation(
            new ValidatedQuestion(text, options[0], options[1], options[2], options[3], (byte)result.CorrectOption, explanation),
            null,
            warnings);
    }

    private static string Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Normalize(NormalizationForm.FormC).Trim();
}
