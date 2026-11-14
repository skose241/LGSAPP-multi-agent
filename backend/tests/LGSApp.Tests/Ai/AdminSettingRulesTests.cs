using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Settings;

namespace LGSApp.Tests.Ai;

public class AdminSettingRulesTests
{
    private static IReadOnlyDictionary<string, long?> Changes(params (string Key, long? Value)[] items) =>
        items.ToDictionary(i => i.Key, i => i.Value);

    [Fact]
    public void Whitelist_contains_exactly_the_eight_keys()
    {
        var keys = AdminSettingRules.Definitions.Select(d => d.Key).OrderBy(k => k).ToArray();
        var expected = new[]
        {
            SettingKeys.AiGunlukCozumLimit, SettingKeys.AiGunlukCozumLimitModerator, SettingKeys.AiGunlukCozumGlobalLimit,
            SettingKeys.AiCozumAktifMi, SettingKeys.AiSoruDogrulamaAktifMi, SettingKeys.SoruUretimAktifMi,
            SettingKeys.SoruCarpani, SettingKeys.AiOkunamadiBeklemeSaat
        }.OrderBy(k => k).ToArray();
        Assert.Equal(expected, keys);
        Assert.All(keys, k => Assert.Contains(SettingKeys.Defaults, d => d.Key == k));
    }

    [Theory]
    [InlineData(SettingKeys.AiGunlukCozumLimit, 0, 50)]
    [InlineData(SettingKeys.AiGunlukCozumLimitModerator, 0, 50)]
    [InlineData(SettingKeys.AiGunlukCozumGlobalLimit, 0, 2000)]
    [InlineData(SettingKeys.AiCozumAktifMi, 0, 1)]
    [InlineData(SettingKeys.AiSoruDogrulamaAktifMi, 0, 1)]
    [InlineData(SettingKeys.SoruUretimAktifMi, 0, 1)]
    [InlineData(SettingKeys.SoruCarpani, 0, 5)]
    [InlineData(SettingKeys.AiOkunamadiBeklemeSaat, 1, 168)]
    public void Bounds_are_accepted_and_one_past_is_rejected(string key, int min, int max)
    {
        Assert.True(AdminSettingRules.Validate(Changes((key, min))).Succeeded);
        Assert.True(AdminSettingRules.Validate(Changes((key, max))).Succeeded);

        var below = AdminSettingRules.Validate(Changes((key, min - 1L)));
        var above = AdminSettingRules.Validate(Changes((key, max + 1L)));
        Assert.False(below.Succeeded);
        Assert.False(above.Succeeded);
        Assert.Equal(ServiceErrorKind.Validation, below.Error);
        Assert.Equal($"'{key}' {min} ile {max} arasında olmalıdır.", above.Message);
    }

    [Fact]
    public void Unknown_or_non_whitelisted_key_is_rejected_with_turkish_message()
    {
        var result = AdminSettingRules.Validate(Changes((SettingKeys.PuanDogruCevap, 5)));
        Assert.False(result.Succeeded);
        Assert.Equal("'puanDogruCevap' ayarı bu uçtan değiştirilemez.", result.Message);

        var other = AdminSettingRules.Validate(Changes(("olmayanAyar", 1)));
        Assert.Equal("'olmayanAyar' ayarı bu uçtan değiştirilemez.", other.Message);
    }

    [Fact]
    public void Key_matching_is_case_sensitive()
    {
        Assert.False(AdminSettingRules.Validate(Changes(("AIGUNLUKCOZUMLIMIT", 5))).Succeeded);
    }

    [Fact]
    public void Non_integer_value_is_rejected()
    {
        var result = AdminSettingRules.Validate(Changes((SettingKeys.SoruCarpani, null)));
        Assert.False(result.Succeeded);
        Assert.Equal("'soruCarpani' bir tam sayı olmalıdır.", result.Message);
    }

    [Fact]
    public void Huge_values_do_not_overflow()
    {
        Assert.False(AdminSettingRules.Validate(Changes((SettingKeys.AiGunlukCozumGlobalLimit, long.MaxValue))).Succeeded);
        Assert.False(AdminSettingRules.Validate(Changes((SettingKeys.AiGunlukCozumGlobalLimit, 4294967297L))).Succeeded);
    }

    [Fact]
    public void Validation_is_all_or_nothing_and_reports_every_bad_key()
    {
        var result = AdminSettingRules.Validate(Changes(
            (SettingKeys.AiGunlukCozumLimit, 10),
            (SettingKeys.SoruCarpani, 9),
            ("bilinmeyen", 1)));

        Assert.False(result.Succeeded);
        Assert.Null(result.Value);
        Assert.NotNull(result.Errors);
        Assert.Equal(2, result.Errors!.Count);
        Assert.Contains(SettingKeys.SoruCarpani, result.Errors.Keys);
        Assert.Contains("bilinmeyen", result.Errors.Keys);
        Assert.DoesNotContain(SettingKeys.AiGunlukCozumLimit, result.Errors.Keys);
    }

    [Fact]
    public void Valid_partial_update_returns_all_accepted_values()
    {
        var result = AdminSettingRules.Validate(Changes((SettingKeys.AiGunlukCozumLimit, 3), (SettingKeys.AiCozumAktifMi, 0)));
        Assert.True(result.Succeeded);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal(3, result.Value[SettingKeys.AiGunlukCozumLimit]);
        Assert.Equal(0, result.Value[SettingKeys.AiCozumAktifMi]);
    }

    [Fact]
    public void Empty_or_null_body_is_rejected()
    {
        Assert.Equal(AdminSettingRules.EmptyMessage, AdminSettingRules.Validate(Changes()).Message);
        Assert.False(AdminSettingRules.Validate(null).Succeeded);
    }

    [Fact]
    public void Defaults_of_whitelisted_keys_are_inside_their_ranges()
    {
        foreach (var d in AdminSettingRules.Definitions)
        {
            var value = SettingKeys.Defaults.First(x => x.Key == d.Key).Value;
            Assert.InRange(value, d.Min, d.Max);
        }
    }
}
