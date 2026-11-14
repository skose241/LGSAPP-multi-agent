using System.Globalization;
using System.Text;

namespace LGSApp.Infrastructure.Services.Common;

public static class AnswerKeyReviewNote
{
    public const int MaxLength = 500;

    public static Failure? TryPrepare(string? raw, out string? note)
    {
        note = null;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        string composed;
        try
        {
            composed = raw.Normalize(NormalizationForm.FormC).Trim();
        }
        catch (ArgumentException)
        {
            return Fail.Validation("Not geçersiz karakter içeriyor.");
        }

        foreach (var c in composed)
        {
            if (char.IsControl(c) && c != '\t' && c != '\n' && c != '\r')
            {
                return Fail.Validation("Not geçersiz karakter içeriyor.");
            }
        }

        if (composed.Length > MaxLength)
        {
            return Fail.Validation($"Not en fazla {MaxLength.ToString(CultureInfo.InvariantCulture)} karakter olabilir.");
        }

        note = composed.Length == 0 ? null : composed;
        return null;
    }
}
