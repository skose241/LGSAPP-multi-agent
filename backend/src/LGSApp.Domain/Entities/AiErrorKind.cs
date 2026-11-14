namespace LGSApp.Domain.Entities;

public enum AiErrorKind : byte
{
    None = 0,
    RateLimited = 1,
    QuotaExhausted = 2,
    Unavailable = 3,
    Timeout = 4,
    AuthFailed = 5,
    InvalidRequest = 6,
    Blocked = 7,
    Truncated = 8,
    InvalidOutput = 9,
    Unreadable = 10,
    NotConfigured = 11,
    Canceled = 12
}
