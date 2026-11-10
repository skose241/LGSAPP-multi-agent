namespace LGSApp.Infrastructure.Options;

public class SeedOptions
{
    public const string SectionName = "Seed";

    public bool Enabled { get; set; } = true;
    public string? AdminUserName { get; set; }
    public string? AdminPassword { get; set; }
    public string? AdminEmail { get; set; }
    public string AdminFirstName { get; set; } = "Sistem";
    public string AdminLastName { get; set; } = "Mudur";
}
