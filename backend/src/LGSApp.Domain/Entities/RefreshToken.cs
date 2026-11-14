namespace LGSApp.Domain.Entities;

public class RefreshToken
{
    public long Id { get; set; }
    public int UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public Guid FamilyId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime FamilyExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? RevokedReason { get; set; }
    public long? ReplacedByTokenId { get; set; }
    public string SecurityStampHash { get; set; } = string.Empty;
}
