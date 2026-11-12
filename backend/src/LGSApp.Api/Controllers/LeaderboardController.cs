using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Leaderboard;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/leaderboard")]
[Authorize(Policy = Policies.Kullanici)]
public class LeaderboardController(ILeaderboardService leaderboard) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] string? period,
        [FromQuery] int offset = 0,
        [FromQuery] int top = 50,
        CancellationToken cancellationToken = default)
    {
        LeaderboardPeriod parsed;
        if (string.IsNullOrWhiteSpace(period) || period.Equals("weekly", StringComparison.OrdinalIgnoreCase))
        {
            parsed = LeaderboardPeriod.Weekly;
        }
        else if (period.Equals("monthly", StringComparison.OrdinalIgnoreCase))
        {
            parsed = LeaderboardPeriod.Monthly;
        }
        else
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Geçersiz istek.", detail: "Dönem 'weekly' veya 'monthly' olmalıdır.");
        }

        var result = await leaderboard.GetAsync(User.ToActor(), parsed, offset, top, cancellationToken);
        return result.ToActionResult(this);
    }
}
