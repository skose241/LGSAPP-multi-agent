using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Ai;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/admin/ai")]
[Authorize(Policy = Policies.MudurOnly)]
public class AdminAiController(IAiAdminService admin) : ControllerBase
{
    [HttpGet("usage")]
    public async Task<IActionResult> Usage([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken cancellationToken) =>
        (await admin.GetUsageAsync(from, to, cancellationToken)).ToActionResult(this);

    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken cancellationToken) =>
        Ok(await admin.GetStatusAsync(cancellationToken));
}
