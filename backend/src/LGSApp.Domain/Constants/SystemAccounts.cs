namespace LGSApp.Domain.Constants;

public static class SystemAccounts
{
    public const string AiUserName = "yapay.zeka";
    public const string AiFirstName = "Yapay";
    public const string AiLastName = "Zekâ";
    public const string ManagedMessage = "Yapay zekâ hesabı sistem tarafından yönetilir.";
    public const string MudurBanMessage = "Müdür hesapları banlanamaz.";
    public const string MudurBanErrorCode = "MudurBanForbidden";
}

public sealed class SystemAccountIntegrityException(string message) : InvalidOperationException(message);

public sealed class UserNameConflictException(string message) : InvalidOperationException(message);
