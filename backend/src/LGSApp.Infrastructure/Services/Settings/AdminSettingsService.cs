using System.Globalization;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Settings;

public sealed record AdminSettingView(string Key, int Value, string Description, int Min, int Max, DateTime? UpdatedAt, int DefaultValue);

public sealed record AdminSettingsUpdateResult(IReadOnlyList<string> Changed, IReadOnlyList<AdminSettingView> Settings);

public interface IAdminSettingsService
{
    Task<IReadOnlyList<AdminSettingView>> ListAsync(CancellationToken cancellationToken);
    Task<ServiceResult<AdminSettingsUpdateResult>> UpdateAsync(int userId, IReadOnlyDictionary<string, long?>? changes, CancellationToken cancellationToken);
}

public sealed class AdminSettingsService(AppDbContext db, ISettingsService settings, TurkeyTime clock) : IAdminSettingsService
{
    private static readonly Dictionary<string, (int Value, string Description)> Defaults =
        SettingKeys.Defaults.ToDictionary(d => d.Key, d => (d.Value, d.Description), StringComparer.Ordinal);

    public async Task<IReadOnlyList<AdminSettingView>> ListAsync(CancellationToken cancellationToken)
    {
        var keys = AdminSettingRules.Definitions.Select(d => d.Key).ToList();
        var rows = await db.Settings.AsNoTracking().Where(s => keys.Contains(s.Key)).ToListAsync(cancellationToken);
        return Build(rows);
    }

    public async Task<ServiceResult<AdminSettingsUpdateResult>> UpdateAsync(int userId, IReadOnlyDictionary<string, long?>? changes, CancellationToken cancellationToken)
    {
        var validation = AdminSettingRules.Validate(changes);
        if (!validation.Succeeded)
        {
            return ServiceResult<AdminSettingsUpdateResult>.From(validation);
        }

        var accepted = validation.Value!;
        var keys = accepted.Keys.ToList();
        var rows = await db.Settings.Where(s => keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key, StringComparer.Ordinal, cancellationToken);
        var now = clock.UtcNow;
        var changed = new List<string>();

        foreach (var (key, value) in accepted.OrderBy(a => a.Key, StringComparer.Ordinal))
        {
            var text = value.ToString(CultureInfo.InvariantCulture);
            if (rows.TryGetValue(key, out var row))
            {
                if (CurrentValue(row.Key, row) == value)
                {
                    continue;
                }

                row.Value = text;
                row.UpdatedAt = now;
                row.UpdatedByUserId = userId;
            }
            else
            {
                if (Defaults.TryGetValue(key, out var def) && def.Value == value)
                {
                    continue;
                }

                db.Settings.Add(new Setting
                {
                    Key = key,
                    Value = text,
                    Description = Defaults.TryGetValue(key, out var d) ? d.Description : null,
                    UpdatedAt = now,
                    UpdatedByUserId = userId
                });
            }

            changed.Add(key);
        }

        if (changed.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
            settings.Invalidate();
        }

        var all = await ListAsync(cancellationToken);
        return ServiceResult<AdminSettingsUpdateResult>.Ok(new AdminSettingsUpdateResult(changed, all));
    }

    private static IReadOnlyList<AdminSettingView> Build(IReadOnlyList<Setting> rows)
    {
        var byKey = rows.ToDictionary(r => r.Key, StringComparer.Ordinal);
        var result = new List<AdminSettingView>(AdminSettingRules.Definitions.Count);
        foreach (var definition in AdminSettingRules.Definitions)
        {
            Defaults.TryGetValue(definition.Key, out var def);
            byKey.TryGetValue(definition.Key, out var row);
            var value = row is null ? def.Value : CurrentValue(definition.Key, row);
            result.Add(new AdminSettingView(definition.Key, value, def.Description ?? row?.Description ?? string.Empty, definition.Min, definition.Max, row?.UpdatedAt, def.Value));
        }

        return result;
    }

    private static int CurrentValue(string key, Setting row) =>
        int.TryParse(row.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : Defaults.TryGetValue(key, out var def) ? def.Value : 0;
}
