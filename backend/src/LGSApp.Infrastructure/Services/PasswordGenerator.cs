using System.Security.Cryptography;

namespace LGSApp.Infrastructure.Services;

public static class PasswordGenerator
{
    private const string Upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private const string Lower = "abcdefghijkmnpqrstuvwxyz";
    private const string Digits = "23456789";
    private const string Symbols = "!@#$%*?";

    public static string Generate(int length = 14)
    {
        if (length < 8)
        {
            length = 8;
        }

        var all = Upper + Lower + Digits + Symbols;
        var chars = new List<char>
        {
            Pick(Upper),
            Pick(Lower),
            Pick(Digits),
            Pick(Symbols)
        };

        while (chars.Count < length)
        {
            chars.Add(Pick(all));
        }

        for (var i = chars.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }

        return new string(chars.ToArray());
    }

    private static char Pick(string set) => set[RandomNumberGenerator.GetInt32(set.Length)];
}
