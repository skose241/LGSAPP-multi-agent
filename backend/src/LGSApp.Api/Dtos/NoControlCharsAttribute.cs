using System.ComponentModel.DataAnnotations;

namespace LGSApp.Api.Dtos;

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class NoControlCharsAttribute : ValidationAttribute
{
    public const string DefaultMessage = "Metin geçersiz kontrol karakterleri içeremez.";

    public NoControlCharsAttribute()
        : base(DefaultMessage)
    {
    }

    public override bool IsValid(object? value)
    {
        if (value is not string text)
        {
            return true;
        }

        foreach (var c in text)
        {
            if (char.IsControl(c) && c != '\t' && c != '\n' && c != '\r')
            {
                return false;
            }
        }

        return true;
    }
}
