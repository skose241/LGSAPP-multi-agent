using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/admin/generation-schedule")]
[Authorize(Policy = Policies.MudurOnly)]
public class AdminGenerationScheduleController(IGenerationScheduleService schedule) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken) =>
        Ok(await schedule.GetAsync(cancellationToken));

    [HttpPut]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> Replace(ReplaceGenerationScheduleRequest request, CancellationToken cancellationToken)
    {
        var items = request.Items!.Select(i => new ScheduleItemView(i.IsoDayOfWeek, i.LessonId, i.QuestionCount)).ToList();
        return (await schedule.ReplaceAsync(items, cancellationToken)).ToActionResult(this);
    }
}
