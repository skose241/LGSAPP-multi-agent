using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services;

public class RecoveryCodeService(AppDbContext db, IOptions<RecoveryCodeOptions> options)
{
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private const int GroupLength = 4;
    private const int GroupCount = 3;
    private const int CodeLength = GroupLength * GroupCount;

    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return null;
        }

        var cleaned = new StringBuilder(CodeLength);
        foreach (var c in input)
        {
            if (c == '-' || char.IsWhiteSpace(c))
            {
                continue;
            }

            cleaned.Append(char.ToUpperInvariant(c));
        }

        var value = cleaned.ToString();
        return value.Length == CodeLength && value.All(c => Alphabet.Contains(c, StringComparison.Ordinal)) ? value : null;
    }

    public string Hash(int userId, string normalizedCode)
    {
        var data = Encoding.UTF8.GetBytes($"lgsapp-recovery:{userId.ToString(CultureInfo.InvariantCulture)}:{normalizedCode}");
        return Convert.ToHexString(HMACSHA256.HashData(options.Value.PepperBytes(), data)).ToLowerInvariant();
    }

    public async Task<IReadOnlyList<string>> IssueAsync(int userId, CancellationToken cancellationToken = default)
    {
        await db.RecoveryCodes.Where(c => c.UserId == userId).ExecuteDeleteAsync(cancellationToken);

        var plain = new List<string>(MudurRules.RecoveryCodeCount);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        while (plain.Count < MudurRules.RecoveryCodeCount)
        {
            var raw = Generate();
            if (seen.Add(raw))
            {
                plain.Add(raw);
            }
        }

        var now = DateTime.UtcNow;
        db.RecoveryCodes.AddRange(plain.Select(p => new RecoveryCode
        {
            UserId = userId,
            CodeHash = Hash(userId, p),
            CreatedAt = now
        }));
        await db.SaveChangesAsync(cancellationToken);

        return plain.Select(Format).ToList();
    }

    public Task<int> RemainingAsync(int userId, CancellationToken cancellationToken = default) =>
        db.RecoveryCodes.AsNoTracking().CountAsync(c => c.UserId == userId && c.UsedAt == null, cancellationToken);

    public Task<int> RevokeAllAsync(int userId, CancellationToken cancellationToken = default) =>
        db.RecoveryCodes.Where(c => c.UserId == userId).ExecuteDeleteAsync(cancellationToken);

    public async Task<int?> FindMatchAsync(int userId, string? input, CancellationToken cancellationToken = default)
    {
        var normalized = Normalize(input);
        var candidate = Encoding.ASCII.GetBytes(Hash(userId, normalized ?? new string('0', CodeLength)));
        var rows = await db.RecoveryCodes.AsNoTracking()
            .Where(c => c.UserId == userId && c.UsedAt == null)
            .Select(c => new { c.Id, c.CodeHash })
            .ToListAsync(cancellationToken);

        int? match = null;
        foreach (var row in rows)
        {
            var stored = Encoding.ASCII.GetBytes(row.CodeHash);
            if (CryptographicOperations.FixedTimeEquals(stored, candidate) && normalized is not null)
            {
                match = row.Id;
            }
        }

        return match;
    }

    public async Task<bool> ConsumeAsync(int codeId, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var affected = await db.RecoveryCodes
            .Where(c => c.Id == codeId && c.UsedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.UsedAt, now), cancellationToken);
        return affected == 1;
    }

    private static string Generate()
    {
        var chars = new char[CodeLength];
        for (var i = 0; i < chars.Length; i++)
        {
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }

        return new string(chars);
    }

    private static string Format(string raw) => string.Join("-", Enumerable.Range(0, GroupCount).Select(i => raw.Substring(i * GroupLength, GroupLength)));
}
