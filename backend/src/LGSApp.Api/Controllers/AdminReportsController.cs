using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Reports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/admin/reports")]
[Authorize(Policy = Policies.OgretmenOrMudur)]
public class AdminReportsController(IReportModerationService moderation) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<ReportListView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(
        [FromQuery] ReportStatus? status,
        [FromQuery] ReportTargetType? targetType,
        [FromQuery] ReportReason? reason,
        [FromQuery] int? questionId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (status is { } s && !Enum.IsDefined(s))
        {
            return InvalidFilter("Durum 'pending', 'resolved' veya 'rejected' olmalıdır.");
        }

        if (targetType is { } t && !Enum.IsDefined(t))
        {
            return InvalidFilter("Hedef türü 'question', 'comment' veya 'solution' olmalıdır.");
        }

        if (reason is { } r && !Enum.IsDefined(r))
        {
            return InvalidFilter("Geçersiz şikayet nedeni.");
        }

        var query = new ReportListQuery(status, targetType, reason, questionId, page, pageSize);
        return (await moderation.ListAsync(User.ToActor(), query, cancellationToken)).ToActionResult(this);
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType<ReportDetailView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Detail(int id, CancellationToken cancellationToken) =>
        (await moderation.GetAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    [HttpPost("{id:int}/resolve")]
    [ProducesResponseType<ReportResolveView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Resolve(int id, ResolveReportRequest request, CancellationToken cancellationToken)
    {
        var command = new ResolveReportCommand(request.Action, request.Note, request.CorrectOption, request.RowVersion);
        return (await moderation.ResolveAsync(User.ToActor(), id, command, cancellationToken)).ToActionResult(this);
    }

    private ObjectResult InvalidFilter(string detail) =>
        Problem(statusCode: StatusCodes.Status400BadRequest, title: "Geçersiz istek.", detail: detail);
}
