using System.Security.Cryptography;
using System.Text;
using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Options;

namespace LGSApp.Infrastructure.Services.RefreshTokens;

public enum RefreshDecision
{
    Rotate = 0,
    RotateWithinGrace = 1,
    ReuseDetected = 2,
    Expired = 3,
    Revoked = 4
}

public readonly record struct RefreshTokenState(
    DateTime ExpiresAt,
    DateTime FamilyExpiresAt,
    DateTime? RevokedAt,
    string? RevokedReason,
    long? ReplacedByTokenId);

public readonly record struct RefreshLifetime(DateTime ExpiresAt, DateTime FamilyExpiresAt);

public static class RefreshTokenRules
{
    private const int TokenBytes = 32;

    public static bool CanHoldRefreshToken(bool mustChangePassword) => !mustChangePassword;

    public static string GenerateToken() =>
        Base64UrlEncode(RandomNumberGenerator.GetBytes(TokenBytes));

    public static string HashToken(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public static string HashSecurityStamp(string? stamp) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(stamp ?? string.Empty)));

    public static RefreshLifetime NewFamily(bool isMudur, DateTime now, RefreshTokenOptions options)
    {
        var familyExpires = isMudur
            ? now.AddHours(options.MudurAbsoluteHours)
            : now.AddDays(options.FamilyMaxDays);
        return new RefreshLifetime(NextExpiry(isMudur, now, familyExpires, options), familyExpires);
    }

    public static RefreshLifetime Rotate(bool isMudur, DateTime now, DateTime familyExpiresAt, RefreshTokenOptions options) =>
        new(NextExpiry(isMudur, now, familyExpiresAt, options), familyExpiresAt);

    public static RefreshDecision Evaluate(RefreshTokenState state, DateTime now, RefreshTokenOptions options)
    {
        if (state.RevokedAt is null)
        {
            return IsExpired(state, now) ? RefreshDecision.Expired : RefreshDecision.Rotate;
        }

        if (state.RevokedReason != RefreshRevokeReasons.Rotated || state.ReplacedByTokenId is null)
        {
            return RefreshDecision.Revoked;
        }

        if (now - state.RevokedAt.Value > TimeSpan.FromSeconds(options.ReuseGraceSeconds))
        {
            return RefreshDecision.ReuseDetected;
        }

        return IsExpired(state, now) ? RefreshDecision.Expired : RefreshDecision.RotateWithinGrace;
    }

    public static bool CanIssueGraceSibling(int liveTokensSinceRotation, RefreshTokenOptions options) =>
        liveTokensSinceRotation < 1 + options.MaxGraceSiblings;

    public static DateTime CleanupCutoff(DateTime now, RefreshTokenOptions options) =>
        now.AddDays(-options.CleanupRetentionDays);

    private static bool IsExpired(RefreshTokenState state, DateTime now) =>
        now >= state.ExpiresAt || now >= state.FamilyExpiresAt;

    private static DateTime NextExpiry(bool isMudur, DateTime now, DateTime familyExpiresAt, RefreshTokenOptions options)
    {
        if (isMudur)
        {
            return familyExpiresAt;
        }

        var sliding = now.AddDays(options.SlidingDays);
        return sliding < familyExpiresAt ? sliding : familyExpiresAt;
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
