using System.Text;
using System.Text.RegularExpressions;

namespace LGSApp.Domain.Constants;

public static partial class CommentRules
{
    public const int BodyColumnMaxLength = 800;
    public const int ModerationReasonMaxLength = 300;
    public const int AbsoluteMaxDepth = 10;
    public const int MaxConsecutiveBlankLines = 3;
    public const int DuplicateWindowSeconds = 60;
    public const int MaxEditCount = 255;

    public static string Normalize(string? body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return string.Empty;
        }

        var text = body.Replace("\r\n", "\n").Replace('\r', '\n');
        var builder = new StringBuilder(text.Length);
        foreach (var c in text)
        {
            if (c == '\n' || c == '\t' || !char.IsControl(c))
            {
                builder.Append(c);
            }
        }

        text = builder.ToString().Trim();
        return ExcessNewLines().Replace(text, new string('\n', MaxConsecutiveBlankLines + 1));
    }

    [GeneratedRegex("\n{5,}")]
    private static partial Regex ExcessNewLines();
}
