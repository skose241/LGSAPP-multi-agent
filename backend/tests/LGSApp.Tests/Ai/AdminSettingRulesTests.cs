using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Settings;

namespace LGSApp.Tests.Ai;

public class AdminSettingRulesTests
{
    private static IReadOnlyDictionary<string, long?> Changes(params (string Key, long? Value)[] items) =>
        items.ToDictionary(i => i.Key, i => i.Value);

    [Fact]
    public void Whitelist_contains_every_default_key_except_the_unused_daily_count()
    {
        var keys = AdminSettingRules.Definitions.Select(d => d.Key).OrderBy(k => k).ToArray();
        var expected = SettingKeys.Defaults.Select(d => d.Key).Where(k => k != SettingKeys.GunlukSoruSayisi).OrderBy(k => k).ToArray();
        Assert.Equal(expected, keys);
        Assert.Equal(keys.Length, keys.Distinct().Count());
    }

    private static IReadOnlyDictionary<string, int> LowestValues() =>
        AdminSettingRules.Definitions.ToDictionary(d => d.Key, d => AdminSettingRules.CrossRules.Any(r => r.UpperKey == d.Key) ? d.Max : d.Min);

    [Theory]
    [InlineData(SettingKeys.YorumGorunurDerinlik, 5, SettingKeys.YorumMaxDerinlik, 4, true)]
    [InlineData(SettingKeys.YorumGorunurDerinlik, 4, SettingKeys.YorumMaxDerinlik, 4, false)]
    [InlineData(SettingKeys.AciklamaMinKarakter, 200, SettingKeys.CozumMaxKarakter, 150, true)]
    [InlineData(SettingKeys.AciklamaMinKarakter, 150, SettingKeys.CozumMaxKarakter, 150, false)]
    public void Cross_rules_compare_values_sent_together(string lowerKey, int lower, string upperKey, int upper, bool violated)
    {
        var result = AdminSettingRules.Validate(Changes((lowerKey, lower), (upperKey, upper)));

        Assert.Equal(!violated, result.Succeeded);
        if (violated)
        {
            Assert.Equal(ServiceErrorKind.Validation, result.Error);
            Assert.Contains(lowerKey, result.Errors!.Keys);
            Assert.Contains(upperKey, result.Errors.Keys);
        }
    }

    [Fact]
    public void Cross_rules_use_stored_values_for_the_key_not_sent()
    {
        var current = new Dictionary<string, int> { [SettingKeys.YorumGorunurDerinlik] = 6, [SettingKeys.CozumMaxKarakter] = 1000 };

        var depth = AdminSettingRules.Validate(Changes((SettingKeys.YorumMaxDerinlik, 5)), current);
        Assert.False(depth.Succeeded);
        Assert.Equal("'yorumGorunurDerinlik', 'yorumMaxDerinlik' değerinden büyük olamaz.", depth.Message);

        var length = AdminSettingRules.Validate(Changes((SettingKeys.AciklamaMinKarakter, 500)), current);
        Assert.True(length.Succeeded);

        var tooLong = AdminSettingRules.Validate(Changes((SettingKeys.CozumMaxKarakter, 100)), new Dictionary<string, int> { [SettingKeys.AciklamaMinKarakter] = 300 });
        Assert.False(tooLong.Succeeded);
    }

    [Fact]
    public void Cross_rule_failure_is_all_or_nothing()
    {
        var result = AdminSettingRules.Validate(Changes((SettingKeys.PuanDogruCevap, 7), (SettingKeys.YorumGorunurDerinlik, 9), (SettingKeys.YorumMaxDerinlik, 2)));
        Assert.False(result.Succeeded);
        Assert.Null(result.Value);
        Assert.DoesNotContain(SettingKeys.PuanDogruCevap, result.Errors!.Keys);
    }

    [Fact]
    public void Groups_and_critical_flags_are_assigned()
    {
        var ai = new[]
        {
            SettingKeys.AiGunlukCozumLimit, SettingKeys.AiGunlukCozumLimitModerator, SettingKeys.AiGunlukCozumGlobalLimit,
            SettingKeys.AiCozumAktifMi, SettingKeys.AiSoruDogrulamaAktifMi, SettingKeys.SoruUretimAktifMi,
            SettingKeys.SoruCarpani, SettingKeys.AiOkunamadiBeklemeSaat
        };
        var critical = new[] { SettingKeys.GunlukSoruYuklemeLimiti, SettingKeys.YorumMaxDerinlik, SettingKeys.YorumGorunurDerinlik, SettingKeys.CozumEsikCevapSayisi, SettingKeys.CozumEsikYanlisOrani };

        foreach (var d in AdminSettingRules.Definitions)
        {
            Assert.Equal(ai.Contains(d.Key) ? "ai" : "genel", d.Group);
            Assert.Equal(critical.Contains(d.Key), d.Critical);
        }
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
    [InlineData(SettingKeys.PuanDogruCevap, 0, 100)]
    [InlineData(SettingKeys.PuanSoruYukleme, 0, 100)]
    [InlineData(SettingKeys.PuanCozumYazma, 0, 100)]
    [InlineData(SettingKeys.PuanliSoruYuklemeGunluk, 0, 100)]
    [InlineData(SettingKeys.GunlukSoruYuklemeLimiti, 0, 500)]
    [InlineData(SettingKeys.GunlukDosyaLimitiOgrenci, 1, 1000)]
    [InlineData(SettingKeys.GunlukDosyaLimitiOgretmen, 1, 5000)]
    [InlineData(SettingKeys.AciklamaMinKarakter, 0, 500)]
    [InlineData(SettingKeys.SikayetMinKarakter, 0, 200)]
    [InlineData(SettingKeys.CozumMaxKarakter, 100, 4000)]
    [InlineData(SettingKeys.YorumMaxKarakter, 10, 800)]
    [InlineData(SettingKeys.YorumDuzenlemeDk, 0, 1440)]
    [InlineData(SettingKeys.YorumSoruBasinaMax, 1, 10000)]
    [InlineData(SettingKeys.YorumMaxDerinlik, 1, 10)]
    [InlineData(SettingKeys.YorumGorunurDerinlik, 1, 10)]
    [InlineData(SettingKeys.CozumEsikCevapSayisi, 1, 1000)]
    [InlineData(SettingKeys.CozumEsikYanlisOrani, 0, 100)]
    public void Bounds_are_accepted_and_one_past_is_rejected(string key, int min, int max)
    {
        Assert.True(AdminSettingRules.Validate(Changes((key, min)), LowestValues()).Succeeded);
        Assert.True(AdminSettingRules.Validate(Changes((key, max)), LowestValues()).Succeeded);

        var below = AdminSettingRules.Validate(Changes((key, min - 1L)), LowestValues());
        var above = AdminSettingRules.Validate(Changes((key, max + 1L)), LowestValues());
        Assert.False(below.Succeeded);
        Assert.False(above.Succeeded);
        Assert.Equal(ServiceErrorKind.Validation, below.Error);
        Assert.Equal($"'{key}' {min} ile {max} arasında olmalıdır.", above.Message);
    }

    [Fact]
    public void Unknown_or_non_whitelisted_key_is_rejected_with_turkish_message()
    {
        var result = AdminSettingRules.Validate(Changes((SettingKeys.GunlukSoruSayisi, 5)));
        Assert.False(result.Succeeded);
        Assert.Equal("'gunlukSoruSayisi' ayarı bu uçtan değiştirilemez.", result.Message);

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
