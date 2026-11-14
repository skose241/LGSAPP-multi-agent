using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/settings")]
[Authorize(Policy = Policies.Kullanici)]
public class SettingsController(IPublicSettingsService settings) : ControllerBase
{
    [HttpGet("public")]
    public async Task<ActionResult<PublicSettingsView>> Public(CancellationToken cancellationToken) =>
        Ok(await settings.GetAsync(User.ToActor(), cancellationToken));
}
