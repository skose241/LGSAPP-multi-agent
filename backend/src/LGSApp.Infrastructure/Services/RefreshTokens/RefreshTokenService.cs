using System.Globalization;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.RefreshTokens;

public sealed record IssuedRefreshToken(string Token, DateTime ExpiresAtUtc);

public sealed record RefreshRotation(
    bool Succeeded,
    ApplicationUser? User,
    IReadOnlyList<string> Roles,
    IssuedRefreshToken? Token)
{
    public static RefreshRotation Failed { get; } = new(false, null, [], null);
}

public interface IRefreshTokenService
{
    Task<IssuedRefreshToken> IssueFamilyAsync(ApplicationUser user, IReadOnlyCollection<string> roles, CancellationToken cancellationToken = default);
    Task<RefreshRotation> RotateAsync(string rawToken, CancellationToken cancellationToken = default);
    Task RevokeFamilyAsync(string rawToken, int? requiredUserId, CancellationToken cancellationToken = default);
    Task<int> RevokeAllAsync(int userId, string reason, CancellationToken cancellationToken = default);
    Task<int> CleanupAsync(CancellationToken cancellationToken = default);
}

public static class RefreshTokenRevoker
{
    public static Task<int> RevokeAllAsync(AppDbContext db, int userId, string reason, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        return db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ExecuteUpdateAsync(
                s => s.SetProperty(t => t.RevokedAt, (DateTime?)now).SetProperty(t => t.RevokedReason, reason),
                cancellationToken);
    }

    public static Task<int> RevokeFamilyAsync(AppDbContext db, Guid familyId, string reason, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        return db.RefreshTokens
            .Where(t => t.FamilyId == familyId && t.RevokedAt == null)
            .ExecuteUpdateAsync(
                s => s.SetProperty(t => t.RevokedAt, (DateTime?)now).SetProperty(t => t.RevokedReason, reason),
                cancellationToken);
    }
}

public sealed class RefreshTokenService(
    AppDbContext db,
    UserManager<ApplicationUser> userManager,
    IOptions<RefreshTokenOptions> options,
    ILogger<RefreshTokenService> logger) : IRefreshTokenService
{
    private const int MaxRotationAttempts = 3;
    private const int CleanupBatchSize = 500;
    private const int CleanupMaxBatches = 20;

    private enum AttemptStatus
    {
        Issued = 0,
        Lost = 1,
        FamilyRevoked = 2,
        GraceExceeded = 3
    }

    private sealed record Attempt(AttemptStatus Status, IssuedRefreshToken? Token);

    public async Task<IssuedRefreshToken> IssueFamilyAsync(ApplicationUser user, IReadOnlyCollection<string> roles, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var isMudur = roles.Contains(Roles.Mudur, StringComparer.OrdinalIgnoreCase);
        var lifetime = RefreshTokenRules.NewFamily(isMudur, now, options.Value);
        var raw = RefreshTokenRules.GenerateToken();
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = RefreshTokenRules.HashToken(raw),
            FamilyId = Guid.NewGuid(),
            CreatedAt = now,
            ExpiresAt = lifetime.ExpiresAt,
            FamilyExpiresAt = lifetime.FamilyExpiresAt,
            SecurityStampHash = RefreshTokenRules.HashSecurityStamp(user.SecurityStamp)
        });
        await db.SaveChangesAsync(cancellationToken);
        return new IssuedRefreshToken(raw, lifetime.ExpiresAt);
    }

    public async Task<RefreshRotation> RotateAsync(string rawToken, CancellationToken cancellationToken = default)
    {
        var hash = RefreshTokenRules.HashToken(rawToken);
        var settings = options.Value;

        for (var attempt = 0; attempt < MaxRotationAttempts; attempt++)
        {
            var now = DateTime.UtcNow;
            var token = await db.RefreshTokens.AsNoTracking().FirstOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
            if (token is null)
            {
                return RefreshRotation.Failed;
            }

            var state = new RefreshTokenState(token.ExpiresAt, token.FamilyExpiresAt, token.RevokedAt, token.RevokedReason, token.ReplacedByTokenId);
            var decision = RefreshTokenRules.Evaluate(state, now, settings);
            if (decision == RefreshDecision.ReuseDetected)
            {
                await RefreshTokenRevoker.RevokeFamilyAsync(db, token.FamilyId, RefreshRevokeReasons.Reuse, cancellationToken);
                logger.LogWarning("Yenileme anahtarı yeniden kullanımı tespit edildi; oturum ailesi iptal edildi. Kullanıcı: {UserId}, aile: {FamilyId}", token.UserId, token.FamilyId);
                return RefreshRotation.Failed;
            }

            if (decision is RefreshDecision.Expired or RefreshDecision.Revoked)
            {
                return RefreshRotation.Failed;
            }

            var user = await userManager.FindByIdAsync(token.UserId.ToString(CultureInfo.InvariantCulture));
            var roles = user is null ? [] : (IReadOnlyList<string>)(await userManager.GetRolesAsync(user)).ToList();
            if (user is null || user.IsBanned || roles.Contains(Roles.Ai, StringComparer.OrdinalIgnoreCase))
            {
                await RefreshTokenRevoker.RevokeFamilyAsync(db, token.FamilyId, RefreshRevokeReasons.UserUnavailable, cancellationToken);
                return RefreshRotation.Failed;
            }

            if (!RefreshTokenRules.CanHoldRefreshToken(user.MustChangePassword))
            {
                await RefreshTokenRevoker.RevokeFamilyAsync(db, token.FamilyId, RefreshRevokeReasons.PasswordChangeRequired, cancellationToken);
                return RefreshRotation.Failed;
            }

            var stampHash = RefreshTokenRules.HashSecurityStamp(user.SecurityStamp);
            if (!string.Equals(stampHash, token.SecurityStampHash, StringComparison.Ordinal))
            {
                await RefreshTokenRevoker.RevokeFamilyAsync(db, token.FamilyId, RefreshRevokeReasons.SecurityStamp, cancellationToken);
                return RefreshRotation.Failed;
            }

            var isMudur = roles.Contains(Roles.Mudur, StringComparer.OrdinalIgnoreCase);
            var lifetime = RefreshTokenRules.Rotate(isMudur, now, token.FamilyExpiresAt, settings);
            if (lifetime.ExpiresAt <= now)
            {
                return RefreshRotation.Failed;
            }

            var result = await TryRotateAsync(token, decision, stampHash, lifetime, now, cancellationToken);
            switch (result.Status)
            {
                case AttemptStatus.Issued:
                    return new RefreshRotation(true, user, roles, result.Token);
                case AttemptStatus.FamilyRevoked:
                    return RefreshRotation.Failed;
                case AttemptStatus.GraceExceeded:
                    await RefreshTokenRevoker.RevokeFamilyAsync(db, token.FamilyId, RefreshRevokeReasons.Reuse, cancellationToken);
                    logger.LogWarning("Tolerans penceresinde izin verilen kardeş yenileme sayısı aşıldı; oturum ailesi iptal edildi. Kullanıcı: {UserId}, aile: {FamilyId}", token.UserId, token.FamilyId);
                    return RefreshRotation.Failed;
            }
        }

        return RefreshRotation.Failed;
    }

    public async Task RevokeFamilyAsync(string rawToken, int? requiredUserId, CancellationToken cancellationToken = default)
    {
        var hash = RefreshTokenRules.HashToken(rawToken);
        var token = await db.RefreshTokens.AsNoTracking()
            .Where(t => t.TokenHash == hash)
            .Select(t => new { t.UserId, t.FamilyId })
            .FirstOrDefaultAsync(cancellationToken);
        if (token is null || (requiredUserId is { } userId && userId != token.UserId))
        {
            return;
        }

        await RefreshTokenRevoker.RevokeFamilyAsync(db, token.FamilyId, RefreshRevokeReasons.Logout, cancellationToken);
    }

    public Task<int> RevokeAllAsync(int userId, string reason, CancellationToken cancellationToken = default) =>
        RefreshTokenRevoker.RevokeAllAsync(db, userId, reason, cancellationToken);

    public async Task<int> CleanupAsync(CancellationToken cancellationToken = default)
    {
        var cutoff = RefreshTokenRules.CleanupCutoff(DateTime.UtcNow, options.Value);
        var total = 0;
        for (var batch = 0; batch < CleanupMaxBatches; batch++)
        {
            var ids = await db.RefreshTokens.AsNoTracking()
                .Where(t => t.ExpiresAt < cutoff || t.RevokedAt < cutoff)
                .OrderBy(t => t.Id)
                .Select(t => t.Id)
                .Take(CleanupBatchSize)
                .ToListAsync(cancellationToken);
            if (ids.Count == 0)
            {
                break;
            }

            total += await db.RefreshTokens.Where(t => ids.Contains(t.Id)).ExecuteDeleteAsync(cancellationToken);
            if (ids.Count < CleanupBatchSize)
            {
                break;
            }
        }

        return total;
    }

    private async Task<Attempt> TryRotateAsync(
        RefreshToken previous,
        RefreshDecision decision,
        string stampHash,
        RefreshLifetime lifetime,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            foreach (var entry in db.ChangeTracker.Entries<RefreshToken>().ToList())
            {
                entry.State = EntityState.Detached;
            }

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            if (decision == RefreshDecision.RotateWithinGrace)
            {
                var locked = await db.RefreshTokens
                    .Where(t => t.Id == previous.Id && t.RevokedReason == RefreshRevokeReasons.Rotated)
                    .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedReason, RefreshRevokeReasons.Rotated), cancellationToken);
                if (locked == 0)
                {
                    await transaction.RollbackAsync(cancellationToken);
                    return new Attempt(AttemptStatus.Lost, null);
                }

                var familyRevoked = await db.RefreshTokens.AnyAsync(
                    t => t.FamilyId == previous.FamilyId && t.RevokedAt != null && t.RevokedReason != RefreshRevokeReasons.Rotated,
                    cancellationToken);
                if (familyRevoked)
                {
                    return new Attempt(AttemptStatus.FamilyRevoked, null);
                }

                var rotatedAt = previous.RevokedAt!.Value;
                var live = await db.RefreshTokens.CountAsync(
                    t => t.FamilyId == previous.FamilyId && t.RevokedAt == null && t.CreatedAt >= rotatedAt,
                    cancellationToken);
                if (!RefreshTokenRules.CanIssueGraceSibling(live, options.Value))
                {
                    await transaction.RollbackAsync(cancellationToken);
                    return new Attempt(AttemptStatus.GraceExceeded, null);
                }
            }

            var raw = RefreshTokenRules.GenerateToken();
            var entity = new RefreshToken
            {
                UserId = previous.UserId,
                TokenHash = RefreshTokenRules.HashToken(raw),
                FamilyId = previous.FamilyId,
                CreatedAt = now,
                ExpiresAt = lifetime.ExpiresAt,
                FamilyExpiresAt = lifetime.FamilyExpiresAt,
                SecurityStampHash = stampHash
            };
            db.RefreshTokens.Add(entity);
            await db.SaveChangesAsync(cancellationToken);

            if (decision == RefreshDecision.Rotate)
            {
                var newId = entity.Id;
                var claimed = await db.RefreshTokens
                    .Where(t => t.Id == previous.Id && t.RevokedAt == null)
                    .ExecuteUpdateAsync(
                        s => s.SetProperty(t => t.RevokedAt, (DateTime?)now)
                            .SetProperty(t => t.RevokedReason, RefreshRevokeReasons.Rotated)
                            .SetProperty(t => t.ReplacedByTokenId, (long?)newId),
                        cancellationToken);
                if (claimed == 0)
                {
                    await transaction.RollbackAsync(cancellationToken);
                    db.Entry(entity).State = EntityState.Detached;
                    return new Attempt(AttemptStatus.Lost, null);
                }
            }

            await transaction.CommitAsync(cancellationToken);
            db.Entry(entity).State = EntityState.Detached;
            return new Attempt(AttemptStatus.Issued, new IssuedRefreshToken(raw, lifetime.ExpiresAt));
        });
    }
}
