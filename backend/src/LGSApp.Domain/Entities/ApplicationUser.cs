using Microsoft.AspNetCore.Identity;

namespace LGSApp.Domain.Entities;

public class ApplicationUser : IdentityUser<int>
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? ClassName { get; set; }
    public bool MustChangePassword { get; set; }
    public bool IsBanned { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedByUserId { get; set; }
}
