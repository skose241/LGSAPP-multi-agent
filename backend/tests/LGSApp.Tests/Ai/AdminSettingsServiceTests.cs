using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.Extensions.Caching.Memory;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Ai;

public sealed class AdminSettingsServiceTests : IAsyncLifetime
{
    private readonly string _database = TestDatabase.NewName();
    private readonly TurkeyTime _clock = new(TimeProvider.System);
    private bool _available;
    private int _mudur;

    public async Task InitializeAsync()
    {
        _available = await TestDatabase.TryCreateAsync(_database, async db =>
        {
            var user = new ApplicationUser { UserName = "mudur1", NormalizedUserName = "MUDUR1", SecurityStamp = Guid.NewGuid().ToString(), FirstName = "Mudur", LastName = "Bey" };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            _mudur = user.Id;
        });
    }

    public async Task DisposeAsync()
    {
        if (_available)
        {
            await TestDatabase.DropAsync(_database);
        }
    }

    private static IReadOnlyDictionary<string, long?> Changes(params (string Key, long? Value)[] items) =>
        items.ToDictionary(i => i.Key, i => i.Value);

    [Fact]
    public async Task Update_is_visible_to_readers_immediately_and_lists_group_and_critical()
    {
        if (!_available)
        {
            return;
        }

        await using var db = TestDatabase.Open(_database);
        var cache = new MemoryCache(new MemoryCacheOptions());
        var settings = new SettingsService(db, cache);
        var admin = new AdminSettingsService(db, settings, _clock);
        var publicSettings = new PublicSettingsService(settings, Options.Create(new AiOptions()));
        var student = new Actor(_mudur, Roles.Ogrenci);

        Assert.Equal(10, (await publicSettings.GetAsync(student)).SikayetMinKarakter);

        var result = await admin.UpdateAsync(_mudur, Changes((SettingKeys.SikayetMinKarakter, 40), (SettingKeys.GunlukSoruYuklemeLimiti, 7)), CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal([SettingKeys.GunlukSoruYuklemeLimiti, SettingKeys.SikayetMinKarakter], result.Value!.Changed.Order().ToArray());
        var view = await publicSettings.GetAsync(student);
        Assert.Equal(40, view.SikayetMinKarakter);
        Assert.Equal(7, view.GunlukSoruYuklemeLimiti);

        var depth = result.Value.Settings.Single(s => s.Key == SettingKeys.YorumMaxDerinlik);
        Assert.Equal("genel", depth.Group);
        Assert.True(depth.Critical);
        Assert.Equal("ai", result.Value.Settings.Single(s => s.Key == SettingKeys.SoruCarpani).Group);
        Assert.False(result.Value.Settings.Single(s => s.Key == SettingKeys.SikayetMinKarakter).Critical);
    }

    [Fact]
    public async Task Cross_rule_uses_stored_value_and_rejection_changes_nothing()
    {
        if (!_available)
        {
            return;
        }

        await using var db = TestDatabase.Open(_database);
        var settings = new SettingsService(db, new MemoryCache(new MemoryCacheOptions()));
        var admin = new AdminSettingsService(db, settings, _clock);

        var rejected = await admin.UpdateAsync(_mudur, Changes((SettingKeys.YorumMaxDerinlik, 2), (SettingKeys.PuanDogruCevap, 9)), CancellationToken.None);

        Assert.False(rejected.Succeeded);
        Assert.Equal(5, await settings.GetIntAsync(SettingKeys.PuanDogruCevap));
        Assert.Equal(10, await settings.GetIntAsync(SettingKeys.YorumMaxDerinlik));

        var accepted = await admin.UpdateAsync(_mudur, Changes((SettingKeys.YorumGorunurDerinlik, 2), (SettingKeys.YorumMaxDerinlik, 2)), CancellationToken.None);
        Assert.True(accepted.Succeeded);
        Assert.Equal(2, await settings.GetIntAsync(SettingKeys.YorumMaxDerinlik));
    }
}
