using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Ai;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/ai")]
[Authorize(Policy = Policies.Kullanici)]
public class AiController(IAiSolutionService aiSolutions) : ControllerBase
{
    [HttpGet("quota")]
    public async Task<IActionResult> Quota(CancellationToken cancellationToken) =>
        (await aiSolutions.GetQuotaAsync(User.ToActor(), cancellationToken)).ToActionResult(this);
}
