using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/topic-plans")]
[Authorize(Policy = Policies.OgretmenOrMudur)]
public class TopicPlansController(ITopicPlanService plans) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken cancellationToken) =>
        (await plans.GetAsync(User.ToActor(), from, to, cancellationToken)).ToActionResult(this);

    [HttpPut("{date}/{lessonId:int}")]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> Save(DateOnly date, int lessonId, SaveTopicPlanRequest request, CancellationToken cancellationToken)
    {
        var command = new SaveTopicPlanCommand(request.TopicId, request.TargetCount, request.RowVersion);
        return (await plans.SaveAsync(User.ToActor(), date, lessonId, command, cancellationToken)).ToActionResult(this);
    }

    [HttpDelete("{date}/{lessonId:int}")]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> Delete(DateOnly date, int lessonId, [FromQuery] byte[]? rowVersion, CancellationToken cancellationToken) =>
        (await plans.DeleteAsync(User.ToActor(), date, lessonId, rowVersion, cancellationToken)).ToActionResult(this);
}
