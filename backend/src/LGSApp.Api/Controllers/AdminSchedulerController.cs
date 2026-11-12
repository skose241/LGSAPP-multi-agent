using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/admin/scheduler")]
[Authorize(Policy = Policies.MudurOnly)]
public class AdminSchedulerController(ISchedulerQueryService queries, ISchedulerService scheduler) : ControllerBase
{
    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken cancellationToken) =>
        Ok(await queries.GetStatusAsync(cancellationToken));

    [HttpGet("runs")]
    public async Task<IActionResult> Runs(
        [FromQuery] string? kind,
        [FromQuery] string? status,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        GenerationKind? parsedKind = null;
        if (!string.IsNullOrWhiteSpace(kind))
        {
            if (!RunKindNames.TryParse(kind, out var k))
            {
                return InvalidFilter("Görev türü 'generate', 'complete', 'publish' veya 'assignments' olmalıdır.");
            }

            parsedKind = k;
        }

        GenerationRunStatus? parsedStatus = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!RunKindNames.TryParseStatus(status, out var s))
            {
                return InvalidFilter("Durum 'running', 'succeeded', 'partiallySucceeded', 'failed' veya 'interrupted' olmalıdır.");
            }

            parsedStatus = s;
        }

        if (page < 1 || pageSize < 1 || pageSize > 50)
        {
            return InvalidFilter("Sayfa en az 1, sayfa boyutu 1 ile 50 arasında olmalıdır.");
        }

        return Ok(await queries.ListRunsAsync(new RunFilter(parsedKind, parsedStatus, from, to, page, pageSize), cancellationToken));
    }

    [HttpGet("runs/{id:int}")]
    public async Task<IActionResult> Run(int id, CancellationToken cancellationToken) =>
        (await queries.GetRunAsync(id, cancellationToken)).ToActionResult(this, detail => Ok(new
        {
            detail.Run.Id,
            detail.Run.RunDate,
            detail.Run.Kind,
            detail.Run.Trigger,
            detail.Run.TriggeredBy,
            detail.Run.Status,
            detail.Run.StartedAt,
            detail.Run.FinishedAt,
            detail.Run.LeaseUntil,
            detail.Run.SucceededCount,
            detail.Run.FailedCount,
            detail.Run.Summary,
            detail.Logs
        }));

    [HttpPost("runs")]
    [EnableRateLimiting(RateLimitingExtensions.SchedulerTriggerPolicy)]
    public async Task<IActionResult> Start(StartSchedulerRunRequest request, CancellationToken cancellationToken)
    {
        if (!RunKindNames.TryParse(request.Kind, out var kind))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Geçersiz istek.", detail: "Görev türü 'generate', 'complete', 'publish' veya 'assignments' olmalıdır.");
        }

        var outcome = await scheduler.StartManualAsync(User.GetUserId(), kind, cancellationToken);
        if (outcome.Result.Succeeded)
        {
            var view = outcome.Result.Value!;
            return Accepted($"/api/admin/scheduler/runs/{view.Id}", view);
        }

        if (outcome.ConflictRunId is { } runId)
        {
            var problem = new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "İşlem çakışması oluştu.",
                Detail = outcome.Result.Message
            };
            problem.Extensions["runId"] = runId;
            return new ObjectResult(problem) { StatusCode = StatusCodes.Status409Conflict, ContentTypes = { "application/problem+json" } };
        }

        return outcome.Result.ToActionResult(this);
    }

    private IActionResult InvalidFilter(string detail) =>
        Problem(statusCode: StatusCodes.Status400BadRequest, title: "Geçersiz istek.", detail: detail);
}
