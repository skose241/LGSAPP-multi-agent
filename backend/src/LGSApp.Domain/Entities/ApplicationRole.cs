using Microsoft.AspNetCore.Identity;

namespace LGSApp.Domain.Entities;

public class ApplicationRole : IdentityRole<int>
{
    public ApplicationRole()
    {
    }

    public ApplicationRole(string name) : base(name)
    {
    }
}
