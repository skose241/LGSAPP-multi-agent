using LGSApp.Domain.Constants;
using Microsoft.AspNetCore.Identity;

namespace LGSApp.Infrastructure.Services;

public sealed class TurkishLookupNormalizer : ILookupNormalizer
{
    public string? NormalizeName(string? name) => name is null ? null : UserNameRules.Fold(name);

    public string? NormalizeEmail(string? email) => email?.Normalize().ToUpperInvariant();
}
