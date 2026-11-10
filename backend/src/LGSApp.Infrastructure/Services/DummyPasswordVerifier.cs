using LGSApp.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace LGSApp.Infrastructure.Services;

public class DummyPasswordVerifier
{
    private readonly PasswordHasher<ApplicationUser> _hasher = new();
    private readonly ApplicationUser _dummyUser = new();
    private readonly string _dummyHash;

    public DummyPasswordVerifier()
    {
        _dummyHash = _hasher.HashPassword(_dummyUser, Guid.NewGuid().ToString("N") + "Aa1!");
    }

    public void Verify(string password)
    {
        _hasher.VerifyHashedPassword(_dummyUser, _dummyHash, password);
    }
}
