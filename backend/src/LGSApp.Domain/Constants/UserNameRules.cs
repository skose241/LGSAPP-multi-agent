using System.Text;

namespace LGSApp.Domain.Constants;

public static class UserNameRules
{
    public const int MinLength = 3;
    public const int MaxLength = 50;
    public const string AllowedCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-çğıöşüÇĞİÖŞÜ";

    public const string ReservedMessage = "Bu kullanıcı adı sistem hesapları için ayrılmıştır.";
    public const string InvalidMessage = "harf (Türkçe harfler dahil), rakam, '.', '_' ve '-' içermelidir.";

    private static readonly HashSet<string> ReservedKeys = new(StringComparer.Ordinal) { "YAPAYZEKA", "AI", "SISTEM", "SYSTEM" };

    public static string Canonicalize(string? userName) =>
        string.IsNullOrEmpty(userName) ? string.Empty : userName.Trim().Normalize(NormalizationForm.FormC);

    public static string Fold(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var composed = value.Normalize(NormalizationForm.FormC);
        var builder = new StringBuilder(composed.Length);
        foreach (var c in composed)
        {
            builder.Append(c switch
            {
                'ı' or 'İ' or 'I' or 'i' => 'I',
                'ç' or 'Ç' => 'C',
                'ğ' or 'Ğ' => 'G',
                'ö' or 'Ö' => 'O',
                'ş' or 'Ş' => 'S',
                'ü' or 'Ü' => 'U',
                _ => char.ToUpperInvariant(c)
            });
        }

        return builder.ToString();
    }

    public static bool IsReserved(string? userName)
    {
        if (string.IsNullOrEmpty(userName))
        {
            return false;
        }

        var squeezed = Fold(userName)
            .Replace(".", string.Empty, StringComparison.Ordinal)
            .Replace("_", string.Empty, StringComparison.Ordinal)
            .Replace("-", string.Empty, StringComparison.Ordinal);
        return ReservedKeys.Contains(squeezed);
    }

    public static bool IsValid(string? userName)
    {
        if (string.IsNullOrEmpty(userName))
        {
            return false;
        }

        var composed = userName.Normalize(NormalizationForm.FormC);
        return composed.Length >= MinLength
            && composed.Length <= MaxLength
            && composed.All(c => AllowedCharacters.Contains(c));
    }
}
