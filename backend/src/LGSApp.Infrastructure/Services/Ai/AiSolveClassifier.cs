using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;

namespace LGSApp.Infrastructure.Services.Ai;

public enum AiSolveOutcome
{
    Accepted = 1,
    Mismatch = 2,
    Unreadable = 3,
    Unreliable = 4
}

public sealed record AiSolveClassification(
    AiSolveOutcome Outcome,
    int Option,
    string? SolutionText,
    string Reason,
    AiErrorKind ErrorKind,
    bool KeyDisagreement);

public static class AiSolveClassifier
{
    public static AiSolveClassification Classify(AiSolveResult result, AiSolveMode mode, int keyOption)
    {
        if (result.ErrorKind.IsProviderFailure())
        {
            throw new ArgumentException("Sağlayıcı hataları sınıflandırılamaz; çağıran taraf iade etmelidir.", nameof(result));
        }

        if (!result.Succeeded)
        {
            return Unreliable(result.ErrorKind, result.ErrorMessage ?? "Yapay zekâ yanıtı kullanılamadı.");
        }

        if (!result.Readable)
        {
            return new AiSolveClassification(AiSolveOutcome.Unreadable, 0, null, "Soru okunamadı.", AiErrorKind.Unreadable, false);
        }

        if (result.Answer is < 1 or > 4)
        {
            return Unreliable(AiErrorKind.InvalidOutput, "Yapay zekâ bir şık belirleyemedi.");
        }

        var solution = (result.Solution ?? string.Empty).Trim();
        if (solution.Length < AiRules.SolutionMinLength)
        {
            return Unreliable(AiErrorKind.InvalidOutput, "Çözüm metni çok kısa.");
        }

        if (mode == AiSolveMode.Verified)
        {
            if (result.AgreesWithKey != true)
            {
                return new AiSolveClassification(AiSolveOutcome.Unreliable, result.Answer, null, "Doğrulanmış anahtarla uyuşmayan çözüm üretildi.", AiErrorKind.InvalidOutput, true);
            }

            if (result.Answer != keyOption)
            {
                return Unreliable(AiErrorKind.InvalidOutput, "Çözüm kendi içinde tutarsız: anahtarla uyumlu dendi ancak farklı şık seçildi.");
            }

            return Accepted(result.Answer, solution);
        }

        if (result.Answer == keyOption)
        {
            return Accepted(result.Answer, solution);
        }

        if (result.Confidence is "high" or "medium")
        {
            return new AiSolveClassification(AiSolveOutcome.Mismatch, result.Answer, BuildText(result.Answer, solution), "Yapay zekâ cevap anahtarından farklı bir şık buldu.", AiErrorKind.None, false);
        }

        return Unreliable(AiErrorKind.InvalidOutput, "Düşük güvenli uyuşmazlık.");
    }

    public static string BuildText(int option, string solution)
    {
        var prefix = $"Doğru cevap: {AiPrompts.Letter(option)} şıkkı.\n\n";
        var room = AiRules.SolutionMaxLength - prefix.Length;
        var body = solution.Length <= room ? solution : solution[..room].TrimEnd();
        return prefix + body;
    }

    private static AiSolveClassification Accepted(int option, string solution) =>
        new(AiSolveOutcome.Accepted, option, BuildText(option, solution), "Çözüm cevap anahtarıyla uyumlu.", AiErrorKind.None, false);

    private static AiSolveClassification Unreliable(AiErrorKind kind, string reason) =>
        new(AiSolveOutcome.Unreliable, 0, null, reason, kind, false);
}
