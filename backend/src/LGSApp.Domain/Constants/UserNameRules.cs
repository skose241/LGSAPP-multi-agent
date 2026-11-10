namespace LGSApp.Domain.Constants;

public static class UserNameRules
{
    public const int MinLength = 3;
    public const int MaxLength = 50;
    public const string AllowedCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-";

    public static bool IsValid(string? userName) =>
        !string.IsNullOrEmpty(userName)
        && userName.Length >= MinLength
        && userName.Length <= MaxLength
        && userName.All(c => AllowedCharacters.Contains(c));
}
