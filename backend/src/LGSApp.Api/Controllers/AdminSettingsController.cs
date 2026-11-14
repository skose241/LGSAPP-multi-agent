using System.Text.Json;
using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/admin/settings")]
[Authorize(Policy = Policies.MudurOnly)]
public class AdminSettingsController(IAdminSettingsService settings) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken) =>
        Ok(await settings.ListAsync(cancellationToken));

    [HttpPut]
    [EnableRateLimiting(RateLimitingExtensions.AdminSettingsPolicy)]
    public async Task<IActionResult> Update([FromBody] Dictionary<string, JsonElement>? body, CancellationToken cancellationToken)
    {
        var changes = body?.ToDictionary(
            p => p.Key,
            p => p.Value.ValueKind == JsonValueKind.Number && p.Value.TryGetInt64(out var number) ? (long?)number : null,
            StringComparer.Ordinal);
        return (await settings.UpdateAsync(User.GetUserId(), changes, cancellationToken)).ToActionResult(this);
    }
}
