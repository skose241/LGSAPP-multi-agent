using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Reports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Controllers;

[ApiController]
[Authorize(Policy = Policies.Kullanici)]
public class ReportsController(IReportService reports) : ControllerBase
{
    [HttpPost("api/questions/{id:int}/reports")]
    [EnableRateLimiting(RateLimitingExtensions.ReportCreatePolicy)]
    [ProducesResponseType<ReportCreatedView>(StatusCodes.Status201Created)]
    public async Task<IActionResult> ReportQuestion(int id, CreateReportRequest request, CancellationToken cancellationToken)
    {
        var command = new CreateReportCommand(request.Reason, request.Description);
        var result = await reports.CreateForQuestionAsync(User.ToActor(), id, command, cancellationToken);
        return result.ToActionResult(this, view => Created($"/api/questions/{id}/reports", view));
    }

    [HttpPost("api/solutions/{id:int}/reports")]
    [EnableRateLimiting(RateLimitingExtensions.ReportCreatePolicy)]
    [ProducesResponseType<ReportCreatedView>(StatusCodes.Status201Created)]
    public async Task<IActionResult> ReportSolution(int id, CreateReportRequest request, CancellationToken cancellationToken)
    {
        var command = new CreateReportCommand(request.Reason, request.Description);
        var result = await reports.CreateForSolutionAsync(User.ToActor(), id, command, cancellationToken);
        return result.ToActionResult(this, view => Created($"/api/solutions/{id}/reports", view));
    }
}
