using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Stats;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/me")]
[Authorize(Policy = Policies.OgrenciOnly)]
public class MeController(IStudentStatsService stats) : ControllerBase
{
    [HttpGet("stats")]
    [ProducesResponseType<StudentStatsView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Stats(CancellationToken cancellationToken) =>
        (await stats.GetAsync(User.GetUserId(), cancellationToken)).ToActionResult(this);
}
