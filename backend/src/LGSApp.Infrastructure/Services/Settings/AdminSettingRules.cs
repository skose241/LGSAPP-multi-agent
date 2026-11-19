using System.Globalization;
using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Services.Common;

namespace LGSApp.Infrastructure.Services.Settings;

public static class SettingGroups
{
    public const string Ai = "ai";
    public const string General = "genel";
}

public sealed record AdminSettingDefinition(string Key, int Min, int Max, string Group = SettingGroups.Ai, bool Critical = false);

public sealed record AdminSettingCrossRule(string LowerKey, string UpperKey, string Message);

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
        new(SettingKeys.AiOkunamadiBeklemeSaat, 1, 168),
        new(SettingKeys.PuanDogruCevap, 0, 100, SettingGroups.General),
        new(SettingKeys.PuanSoruYukleme, 0, 100, SettingGroups.General),
        new(SettingKeys.PuanCozumYazma, 0, 100, SettingGroups.General),
        new(SettingKeys.PuanliSoruYuklemeGunluk, 0, 100, SettingGroups.General),
        new(SettingKeys.GunlukSoruYuklemeLimiti, 0, 500, SettingGroups.General, true),
        new(SettingKeys.GunlukDosyaLimitiOgrenci, 1, 1000, SettingGroups.General),
        new(SettingKeys.GunlukDosyaLimitiOgretmen, 1, 5000, SettingGroups.General),
        new(SettingKeys.AciklamaMinKarakter, 0, 500, SettingGroups.General),
        new(SettingKeys.SikayetMinKarakter, 0, 200, SettingGroups.General),
        new(SettingKeys.CozumMaxKarakter, 100, 4000, SettingGroups.General),
        new(SettingKeys.YorumMaxKarakter, 10, 800, SettingGroups.General),
        new(SettingKeys.YorumDuzenlemeDk, 0, 1440, SettingGroups.General),
        new(SettingKeys.YorumSoruBasinaMax, 1, 10000, SettingGroups.General),
        new(SettingKeys.YorumMaxDerinlik, 1, 10, SettingGroups.General, true),
        new(SettingKeys.YorumGorunurDerinlik, 1, 10, SettingGroups.General, true),
        new(SettingKeys.CozumEsikCevapSayisi, 1, 1000, SettingGroups.General, true),
        new(SettingKeys.CozumEsikYanlisOrani, 0, 100, SettingGroups.General, true)
    ];

    public static readonly IReadOnlyList<AdminSettingCrossRule> CrossRules =
    [
        new(SettingKeys.YorumGorunurDerinlik, SettingKeys.YorumMaxDerinlik, "'yorumGorunurDerinlik', 'yorumMaxDerinlik' değerinden büyük olamaz."),
        new(SettingKeys.AciklamaMinKarakter, SettingKeys.CozumMaxKarakter, "'aciklamaMinKarakter', 'cozumMaxKarakter' değerinden büyük olamaz.")
    ];

    private static readonly Dictionary<string, AdminSettingDefinition> ByKey = Definitions.ToDictionary(d => d.Key, StringComparer.Ordinal);

    public static AdminSettingDefinition? Find(string key) => ByKey.GetValueOrDefault(key);

    public static string NotAllowedMessage(string key) => $"'{key}' ayarı bu uçtan değiştirilemez.";

    public static string RangeMessage(AdminSettingDefinition definition) =>
        $"'{definition.Key}' {definition.Min.ToString(CultureInfo.InvariantCulture)} ile {definition.Max.ToString(CultureInfo.InvariantCulture)} arasında olmalıdır.";

    public static string NotIntegerMessage(string key) => $"'{key}' bir tam sayı olmalıdır.";

    public const string EmptyMessage = "En az bir ayar gönderilmelidir.";

    public static ServiceResult<IReadOnlyDictionary<string, int>> Validate(IReadOnlyDictionary<string, long?>? changes, IReadOnlyDictionary<string, int>? current = null)
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

        if (errors.Count == 0)
        {
            var defaults = SettingKeys.Defaults.ToDictionary(d => d.Key, d => d.Value, StringComparer.Ordinal);
            int Effective(string key) =>
                accepted.TryGetValue(key, out var a) ? a
                : current is not null && current.TryGetValue(key, out var c) ? c
                : defaults.GetValueOrDefault(key);

            foreach (var rule in CrossRules)
            {
                var touched = new[] { rule.LowerKey, rule.UpperKey }.Where(accepted.ContainsKey).ToList();
                if (touched.Count > 0 && Effective(rule.LowerKey) > Effective(rule.UpperKey))
                {
                    foreach (var key in touched)
                    {
                        errors[key] = [rule.Message];
                    }

                    first ??= rule.Message;
                }
            }
        }

        if (errors.Count > 0)
        {
            return Fail.Validation(first!, errors);
        }

        return ServiceResult<IReadOnlyDictionary<string, int>>.Ok(accepted);
    }
}
