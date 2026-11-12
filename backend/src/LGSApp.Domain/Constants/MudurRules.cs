namespace LGSApp.Domain.Constants;

public static class MudurRules
{
    public const int PasswordMinLength = 12;
    public const int RecoveryCodeCount = 10;
    public const string PasswordTooShortMessage = "Müdür şifresi en az 12 karakter olmalıdır.";
    public const string PasswordResetForbiddenMessage = "Müdür hesaplarının şifresi bu yolla yenilenemez.";
    public const string PasswordResetForbiddenCode = "MudurPasswordResetForbidden";
    public const string PasswordTooShortCode = "MudurPasswordTooShort";
}
