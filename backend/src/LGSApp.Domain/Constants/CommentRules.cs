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

    private static readonly HashSet<char> StrippedFormatCharacters =
    [
        '‪', '‫', '‬', '‭', '‮',
        '⁦', '⁧', '⁨', '⁩',
        '‎', '‏', '؜',
        '​', '⁠', '﻿'
    ];

    private static readonly CultureInfo TurkishCulture = ResolveTurkishCulture();

    public static string Normalize(string? body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return string.Empty;
        }

        var cleaned = StripUnsafe(body);
        if (cleaned.Length == 0)
        {
            return string.Empty;
        }

        var text = cleaned.Normalize(NormalizationForm.FormC);
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

        return builder.ToString().Trim();
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
            if (Rune.GetUnicodeCategory(rune) == UnicodeCategory.Format)
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

        var folded = builder.ToString().ToLower(TurkishCulture).Replace('ı', 'i').Replace('İ', 'i');
        return Hash(folded);
    }

    private static string Hash(string value) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static string StripUnsafe(string body)
    {
        var builder = new StringBuilder(body.Length);
        for (var i = 0; i < body.Length; i++)
        {
            var c = body[i];

            if (char.IsHighSurrogate(c))
            {
                if (i + 1 < body.Length && char.IsLowSurrogate(body[i + 1]))
                {
                    builder.Append(c).Append(body[i + 1]);
                    i++;
                }

                continue;
            }

            if (char.IsLowSurrogate(c))
            {
                continue;
            }

            switch (c)
            {
                case '\r':
                    if (i + 1 < body.Length && body[i + 1] == '\n')
                    {
                        i++;
                    }

                    builder.Append('\n');
                    continue;
                case '\u0085':
                case '\u2028':
                case '\u2029':
                    builder.Append('\n');
                    continue;
                case '\n':
                case '\t':
                    builder.Append(c);
                    continue;
            }

            if (char.IsControl(c) || StrippedFormatCharacters.Contains(c))
            {
                continue;
            }

            builder.Append(c);
        }

        return builder.ToString();
    }

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
        try
        {
            return CultureInfo.GetCultureInfo("tr-TR");
        }
        catch (CultureNotFoundException)
        {
            return CultureInfo.InvariantCulture;
        }
    }
}
