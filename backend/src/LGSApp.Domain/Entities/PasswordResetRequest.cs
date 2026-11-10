namespace LGSApp.Domain.Entities;

public class PasswordResetRequest
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public PasswordResetStatus Status { get; set; } = PasswordResetStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ProcessedAt { get; set; }
    public int? ProcessedByUserId { get; set; }
    public byte[] RowVersion { get; set; } = [];
}
