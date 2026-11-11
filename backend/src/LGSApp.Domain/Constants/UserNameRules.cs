namespace LGSApp.Domain.Constants;

public static class UserNameRules
{
    public const int MinLength = 3;
    public const int MaxLength = 50;
    public const string AllowedCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-";

    public const string ReservedMessage = "Bu kullanıcı adı sistem hesapları için ayrılmıştır.";

    private static readonly HashSet<string> ReservedNames = new(StringComparer.Ordinal) { "yapayzeka", "ai", "sistem", "system" };

    public static bool IsReserved(string? userName)
    {
        if (string.IsNullOrEmpty(userName))
        {
            return false;
        }

        var squeezed = userName
            .Replace(".", string.Empty, StringComparison.Ordinal)
            .Replace("_", string.Empty, StringComparison.Ordinal)
            .Replace("-", string.Empty, StringComparison.Ordinal)
            .ToLowerInvariant();
        return ReservedNames.Contains(squeezed);
    }

    public static bool IsValid(string? userName) =>
        !string.IsNullOrEmpty(userName)
        && userName.Length >= MinLength
        && userName.Length <= MaxLength
        && userName.All(c => AllowedCharacters.Contains(c));
}
