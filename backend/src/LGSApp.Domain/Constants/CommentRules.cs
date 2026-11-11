using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace LGSApp.Domain.Constants;

public static class CommentRules
{
    public const int BodyColumnMaxLength = 800;
    public const int FingerprintColumnLength = 64;
    public const int ModerationReasonMaxLength = 300;
    public const int AbsoluteMaxDepth = 10;
    public const int MaxConsecutiveBlankLines = 3;
    public const int DuplicateWindowSeconds = 60;
    public const int MaxEditCount = 255;
    public const int AncestorPreviewLength = 80;
    public const int MaxResponseNodes = 500;

    private const int ZeroWidthNonJoiner = 0x200C;
    private const int ZeroWidthJoiner = 0x200D;
    private const int TagRangeStart = 0xE0000;
    private const int TagRangeEnd = 0xE007F;

    private static readonly HashSet<int> InvisibleFillers =
    [
        0x3164,
        0x115F,
        0x1160,
        0xFFA0,
        0x2800,
        0x180E
    ];

    private static CultureInfo? _turkishCulture;

    public static void VerifyGlobalization()
    {
        string? problem = null;
        try
        {
            if (!string.Equals("ç".Normalize(NormalizationForm.FormC), "ç", StringComparison.Ordinal))
            {
                problem = "Unicode normalizasyonu beklenen sonucu vermiyor.";
            }
            else
            {
                var turkish = ResolveTurkishCulture();
                if (!string.Equals("I".ToLower(turkish), "ı", StringComparison.Ordinal)
                    || !string.Equals("i".ToUpper(turkish), "İ", StringComparison.Ordinal))
                {
                    problem = "tr-TR büyük/küçük harf kuralları beklenen sonucu vermiyor.";
                }
            }
        }
        catch (Exception ex) when (ex is InvalidOperationException or ArgumentException or PlatformNotSupportedException)
        {
            problem = ex.Message;
        }

        if (problem is not null)
        {
            throw new InvalidOperationException(
                "Küreselleştirme (ICU/kültür) desteği kullanılamıyor; Türkçe karakter işleme güvence altında değil. InvariantGlobalization kapalı olmalı ve sunucuda ICU kütüphaneleri bulunmalıdır. Ayrıntı: " + problem);
        }
    }

    public static string Normalize(string? body)
    {
        if (string.IsNullOrEmpty(body))
        {
            return string.Empty;
        }

        var runes = Sanitize(body);
        var joined = new StringBuilder(body.Length);
        foreach (var rune in runes)
        {
            joined.Append(rune.ToString());
        }

        var text = joined.ToString().Normalize(NormalizationForm.FormC);
        var lines = text.Split('\n');
        var builder = new StringBuilder(text.Length);
        var blankRun = 0;
        foreach (var rawLine in lines)
        {
            var line = rawLine.TrimEnd();
            if (line.Length == 0)
            {
                blankRun++;
                if (blankRun > MaxConsecutiveBlankLines)
                {
                    continue;
                }
            }
            else
            {
                blankRun = 0;
            }

            builder.Append(line).Append('\n');
        }

        var result = builder.ToString().Trim();
        return HasMeaningfulContent(result) ? result : string.Empty;
    }

    public static string Fingerprint(string? body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return Hash(string.Empty);
        }

        var composed = StripUnpairedSurrogates(body).Normalize(NormalizationForm.FormKC);
        var builder = new StringBuilder(composed.Length);
        var pendingSpace = false;
        foreach (var rune in composed.EnumerateRunes())
        {
            if (IsAlwaysInvisible(rune) || IsJoiner(rune))
            {
                continue;
            }

            if (Rune.IsWhiteSpace(rune) || Rune.IsControl(rune))
            {
                pendingSpace = builder.Length > 0;
                continue;
            }

            if (pendingSpace)
            {
                builder.Append(' ');
                pendingSpace = false;
            }

            builder.Append(rune.ToString());
        }

        return Hash(FoldTurkish(builder.ToString()));
    }

    private static string FoldTurkish(string value)
    {
        var prepared = value.Replace("İ", "i", StringComparison.Ordinal).Replace('İ', 'i');
        var lowered = prepared.ToLower(ResolveTurkishCulture());
        return lowered
            .Replace("i̇", "i", StringComparison.Ordinal)
            .Replace("ı̇", "i", StringComparison.Ordinal)
            .Replace('ı', 'i');
    }

    private static string Hash(string value) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static List<Rune> Sanitize(string body)
    {
        var text = StripUnpairedSurrogates(body);
        var kept = new List<Rune>(text.Length);
        var previousWasCarriageReturn = false;
        foreach (var rune in text.EnumerateRunes())
        {
            var value = rune.Value;
            if (value == '\r')
            {
                kept.Add(new Rune('\n'));
                previousWasCarriageReturn = true;
                continue;
            }

            if (value == '\n')
            {
                if (!previousWasCarriageReturn)
                {
                    kept.Add(rune);
                }

                previousWasCarriageReturn = false;
                continue;
            }

            previousWasCarriageReturn = false;

            if (value is 0x85 or 0x2028 or 0x2029)
            {
                kept.Add(new Rune('\n'));
                continue;
            }

            if (value == '\t')
            {
                kept.Add(rune);
                continue;
            }

            if (IsAlwaysInvisible(rune))
            {
                continue;
            }

            kept.Add(rune);
        }

        var result = new List<Rune>(kept.Count);
        for (var i = 0; i < kept.Count; i++)
        {
            var rune = kept[i];
            if (IsJoiner(rune))
            {
                var previousVisible = result.Count > 0 && IsVisible(result[^1]);
                var nextVisible = i + 1 < kept.Count && IsVisible(kept[i + 1]);
                if (!previousVisible || !nextVisible)
                {
                    continue;
                }
            }

            result.Add(rune);
        }

        return result;
    }

    private static bool IsJoiner(Rune rune) => rune.Value is ZeroWidthNonJoiner or ZeroWidthJoiner;

    private static bool IsAlwaysInvisible(Rune rune)
    {
        if (Rune.IsControl(rune))
        {
            return true;
        }

        if (rune.Value is >= TagRangeStart and <= TagRangeEnd)
        {
            return true;
        }

        if (InvisibleFillers.Contains(rune.Value))
        {
            return true;
        }

        return Rune.GetUnicodeCategory(rune) == UnicodeCategory.Format && !IsJoiner(rune);
    }

    private static bool IsVisible(Rune rune) => IsMeaningfulCategory(Rune.GetUnicodeCategory(rune), true);

    private static bool HasMeaningfulContent(string text)
    {
        foreach (var rune in text.EnumerateRunes())
        {
            if (IsMeaningfulCategory(Rune.GetUnicodeCategory(rune), false))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsMeaningfulCategory(UnicodeCategory category, bool includeMarks) => category switch
    {
        UnicodeCategory.UppercaseLetter
            or UnicodeCategory.LowercaseLetter
            or UnicodeCategory.TitlecaseLetter
            or UnicodeCategory.ModifierLetter
            or UnicodeCategory.OtherLetter
            or UnicodeCategory.DecimalDigitNumber
            or UnicodeCategory.LetterNumber
            or UnicodeCategory.OtherNumber
            or UnicodeCategory.ConnectorPunctuation
            or UnicodeCategory.DashPunctuation
            or UnicodeCategory.OpenPunctuation
            or UnicodeCategory.ClosePunctuation
            or UnicodeCategory.InitialQuotePunctuation
            or UnicodeCategory.FinalQuotePunctuation
            or UnicodeCategory.OtherPunctuation
            or UnicodeCategory.MathSymbol
            or UnicodeCategory.CurrencySymbol
            or UnicodeCategory.ModifierSymbol
            or UnicodeCategory.OtherSymbol => true,
        UnicodeCategory.NonSpacingMark
            or UnicodeCategory.SpacingCombiningMark
            or UnicodeCategory.EnclosingMark => includeMarks,
        _ => false
    };

    private static string StripUnpairedSurrogates(string value)
    {
        var builder = new StringBuilder(value.Length);
        for (var i = 0; i < value.Length; i++)
        {
            var c = value[i];
            if (char.IsHighSurrogate(c) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1]))
            {
                builder.Append(c).Append(value[i + 1]);
                i++;
            }
            else if (!char.IsSurrogate(c))
            {
                builder.Append(c);
            }
        }

        return builder.ToString();
    }

    private static CultureInfo ResolveTurkishCulture()
    {
        var cached = _turkishCulture;
        if (cached is not null)
        {
            return cached;
        }

        try
        {
            var culture = CultureInfo.GetCultureInfo("tr-TR");
            if (!string.Equals(culture.Name, "tr-TR", StringComparison.Ordinal))
            {
                throw new InvalidOperationException("tr-TR kültürü çözümlenemedi; Türkçe karakter işleme kullanılamıyor.");
            }

            _turkishCulture = culture;
            return culture;
        }
        catch (CultureNotFoundException ex)
        {
            throw new InvalidOperationException("tr-TR kültürü çözümlenemedi; Türkçe karakter işleme kullanılamıyor.", ex);
        }
    }
}
