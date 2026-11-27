using System.Text;
using LGSApp.Domain.Entities;

namespace LGSApp.Infrastructure.Services.Questions;

public static class QuestionPoolRules
{
    public const int PreviewLength = 160;
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;
    public const int MinSinceDays = 1;
    public const int MaxSinceDays = 90;
    public const int OptionCount = 4;
    public const int PreviewSourceLength = 400;

    public static (int Page, int PageSize) NormalizePaging(int page, int pageSize) =>
        (Math.Max(1, page), Math.Clamp(pageSize, 1, MaxPageSize));

    public static string? Preview(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var builder = new StringBuilder(Math.Min(text.Length, PreviewLength + 8));
        var pendingSpace = false;
        foreach (var ch in text)
        {
            if (char.IsWhiteSpace(ch))
            {
                pendingSpace = builder.Length > 0;
                continue;
            }

            if (pendingSpace)
            {
                builder.Append(' ');
                pendingSpace = false;
            }

            builder.Append(ch);
            if (builder.Length > PreviewLength + 1)
            {
                break;
            }
        }

        if (builder.Length <= PreviewLength)
        {
            return builder.ToString();
        }

        var cut = PreviewLength;
        if (char.IsHighSurrogate(builder[cut - 1]))
        {
            cut--;
        }

        return builder.ToString(0, cut).TrimEnd() + "…";
    }

    public static bool ShowCorrectOption(bool isModerator, bool isOwner, bool hasAnswered) =>
        isModerator || isOwner || hasAnswered;

    public static bool ShowDiscussionStats(bool isModerator, bool isOwner, bool hasAnswered) =>
        isModerator || isOwner || hasAnswered;

    public static Dictionary<string, string[]> ValidateFilters(
        bool isStudent,
        QuestionSource? source,
        bool? answered,
        int? since,
        bool includeHidden,
        bool scheduled,
        int? authorId = null)
    {
        var errors = new Dictionary<string, string[]>();

        if (source is { } s && !Enum.IsDefined(s))
        {
            errors["source"] = ["Kaynak 'teacher', 'student' veya 'ai' olmalıdır."];
        }

        if (since is { } days && (days < MinSinceDays || days > MaxSinceDays))
        {
            errors["since"] = [$"Gün sayısı {MinSinceDays} ile {MaxSinceDays} arasında olmalıdır."];
        }

        if (!isStudent && answered is not null)
        {
            errors["answered"] = ["Bu filtre yalnızca öğrenciler için kullanılabilir."];
        }

        if (isStudent && includeHidden)
        {
            errors["includeHidden"] = ["Bu filtre yalnızca öğretmen ve müdür için kullanılabilir."];
        }

        if (isStudent && scheduled)
        {
            errors["scheduled"] = ["Bu filtre yalnızca öğretmen ve müdür için kullanılabilir."];
        }

        if (authorId is not null)
        {
            if (isStudent)
            {
                errors["authorId"] = ["Bu filtre yalnızca öğretmen ve müdür için kullanılabilir."];
            }
            else if (authorId <= 0)
            {
                errors["authorId"] = ["Yazar kimliği 0'dan büyük olmalıdır."];
            }
        }

        return errors;
    }
}
