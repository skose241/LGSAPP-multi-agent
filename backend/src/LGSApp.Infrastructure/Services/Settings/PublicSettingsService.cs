using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Settings;

public sealed record PublicSettingsView(
    int AciklamaMinKarakter,
    int CozumMaxKarakter,
    int YorumMaxKarakter,
    int YorumDuzenlemeDk,
    int YorumMaxDerinlik,
    int YorumGorunurDerinlik,
    int SikayetMinKarakter,
    int GunlukSoruYuklemeLimiti,
    int GunlukDosyaLimiti,
    bool AiCozumAktifMi);

public interface IPublicSettingsService
{
    Task<PublicSettingsView> GetAsync(Actor actor, CancellationToken cancellationToken = default);
}

public sealed class PublicSettingsService(ISettingsService settings, IOptions<AiOptions> aiOptions) : IPublicSettingsService
{
    public async Task<PublicSettingsView> GetAsync(Actor actor, CancellationToken cancellationToken = default)
    {
        var fileLimitKey = actor.IsStudent ? SettingKeys.GunlukDosyaLimitiOgrenci : SettingKeys.GunlukDosyaLimitiOgretmen;
        var aiEnabled = await settings.GetIntAsync(SettingKeys.AiCozumAktifMi, cancellationToken) == 1;

        return new PublicSettingsView(
            await settings.GetIntAsync(SettingKeys.AciklamaMinKarakter, cancellationToken),
            await settings.GetIntAsync(SettingKeys.CozumMaxKarakter, cancellationToken),
            await settings.GetIntAsync(SettingKeys.YorumMaxKarakter, cancellationToken),
            await settings.GetIntAsync(SettingKeys.YorumDuzenlemeDk, cancellationToken),
            await settings.GetIntAsync(SettingKeys.YorumMaxDerinlik, cancellationToken),
            await settings.GetIntAsync(SettingKeys.YorumGorunurDerinlik, cancellationToken),
            await settings.GetIntAsync(SettingKeys.SikayetMinKarakter, cancellationToken),
            await settings.GetIntAsync(SettingKeys.GunlukSoruYuklemeLimiti, cancellationToken),
            await settings.GetIntAsync(fileLimitKey, cancellationToken),
            aiEnabled && aiOptions.Value.SolutionConfigured);
    }
}
