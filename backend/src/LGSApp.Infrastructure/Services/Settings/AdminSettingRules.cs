using System.Globalization;
using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Services.Common;

namespace LGSApp.Infrastructure.Services.Settings;

public sealed record AdminSettingDefinition(string Key, int Min, int Max);

public static class AdminSettingRules
{
    public static readonly IReadOnlyList<AdminSettingDefinition> Definitions =
    [
        new(SettingKeys.AiGunlukCozumLimit, 0, 50),
        new(SettingKeys.AiGunlukCozumLimitModerator, 0, 50),
        new(SettingKeys.AiGunlukCozumGlobalLimit, 0, 2000),
        new(SettingKeys.AiCozumAktifMi, 0, 1),
        new(SettingKeys.AiSoruDogrulamaAktifMi, 0, 1),
        new(SettingKeys.SoruUretimAktifMi, 0, 1),
        new(SettingKeys.SoruCarpani, 0, 5),
        new(SettingKeys.AiOkunamadiBeklemeSaat, 1, 168)
    ];

    private static readonly Dictionary<string, AdminSettingDefinition> ByKey = Definitions.ToDictionary(d => d.Key, StringComparer.Ordinal);

    public static AdminSettingDefinition? Find(string key) => ByKey.GetValueOrDefault(key);

    public static string NotAllowedMessage(string key) => $"'{key}' ayarı bu uçtan değiştirilemez.";

    public static string RangeMessage(AdminSettingDefinition definition) =>
        $"'{definition.Key}' {definition.Min.ToString(CultureInfo.InvariantCulture)} ile {definition.Max.ToString(CultureInfo.InvariantCulture)} arasında olmalıdır.";

    public static string NotIntegerMessage(string key) => $"'{key}' bir tam sayı olmalıdır.";

    public const string EmptyMessage = "En az bir ayar gönderilmelidir.";

    public static ServiceResult<IReadOnlyDictionary<string, int>> Validate(IReadOnlyDictionary<string, long?>? changes)
    {
        if (changes is null || changes.Count == 0)
        {
            return Fail.Validation(EmptyMessage);
        }

        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var accepted = new Dictionary<string, int>(StringComparer.Ordinal);
        string? first = null;

        foreach (var (key, raw) in changes.OrderBy(c => c.Key, StringComparer.Ordinal))
        {
            string? message = null;
            var definition = Find(key);
            if (definition is null)
            {
                message = NotAllowedMessage(key);
            }
            else if (raw is not { } value)
            {
                message = NotIntegerMessage(key);
            }
            else if (value < definition.Min || value > definition.Max)
            {
                message = RangeMessage(definition);
            }
            else
            {
                accepted[key] = (int)value;
            }

            if (message is not null)
            {
                errors[key] = [message];
                first ??= message;
            }
        }

        if (errors.Count > 0)
        {
            return Fail.Validation(first!, errors);
        }

        return ServiceResult<IReadOnlyDictionary<string, int>>.Ok(accepted);
    }
}
