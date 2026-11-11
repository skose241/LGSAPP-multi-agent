using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Comments;
using LGSApp.Infrastructure.Services.Reports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Controllers;

[ApiController]
[Authorize(Policy = Policies.Kullanici)]
public class CommentsController(ICommentService comments, IReportService reports) : ControllerBase
{
    [HttpGet("api/questions/{questionId:int}/comments")]
    public async Task<IActionResult> List(
        int questionId,
        [FromQuery] int? solutionId,
        [FromQuery] string? sort,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] bool includeRemoved = false,
        CancellationToken cancellationToken = default)
    {
        CommentSort order;
        if (string.IsNullOrWhiteSpace(sort) || sort.Equals("oldest", StringComparison.OrdinalIgnoreCase))
        {
            order = CommentSort.Oldest;
        }
        else if (sort.Equals("newest", StringComparison.OrdinalIgnoreCase))
        {
            order = CommentSort.Newest;
        }
        else
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Geçersiz istek.", detail: "Sıralama 'oldest' veya 'newest' olmalıdır.");
        }

        var query = new CommentListQuery(solutionId, order, page, pageSize, includeRemoved);
        return (await comments.GetThreadAsync(User.ToActor(), questionId, query, cancellationToken)).ToActionResult(this);
    }

    [HttpGet("api/comments/{id:int}/thread")]
    public async Task<IActionResult> Thread(int id, [FromQuery] bool includeRemoved = false, CancellationToken cancellationToken = default) =>
        (await comments.GetSubthreadAsync(User.ToActor(), id, includeRemoved, cancellationToken)).ToActionResult(this);

    [HttpPost("api/questions/{questionId:int}/comments")]
    [EnableRateLimiting(RateLimitingExtensions.CommentWritePolicy)]
    public async Task<IActionResult> Create(int questionId, CreateCommentRequest request, CancellationToken cancellationToken)
    {
        var command = new CreateCommentCommand(request.Body, request.ParentId, request.SolutionId);
        var result = await comments.CreateAsync(User.ToActor(), questionId, command, cancellationToken);
        return result.ToActionResult(this, view => Created($"/api/questions/{questionId}/comments", view));
    }

    [HttpPatch("api/comments/{id:int}")]
    public async Task<IActionResult> Edit(int id, EditCommentRequest request, CancellationToken cancellationToken)
    {
        var command = new EditCommentCommand(request.Body, request.RowVersion);
        return (await comments.EditAsync(User.ToActor(), id, command, cancellationToken)).ToActionResult(this);
    }

    [HttpDelete("api/comments/{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        (await comments.DeleteAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    [HttpPost("api/comments/{id:int}/remove")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    public async Task<IActionResult> Remove(int id, RemoveCommentRequest request, CancellationToken cancellationToken) =>
        (await comments.RemoveAsync(User.ToActor(), id, request.Reason, cancellationToken)).ToActionResult(this);

    [HttpPost("api/comments/{id:int}/restore")]
    [Authorize(Policy = Policies.MudurOnly)]
    public async Task<IActionResult> Restore(int id, CancellationToken cancellationToken) =>
        (await comments.RestoreAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    [HttpPost("api/comments/{id:int}/reports")]
    [EnableRateLimiting(RateLimitingExtensions.ReportCreatePolicy)]
    public async Task<IActionResult> Report(int id, CreateReportRequest request, CancellationToken cancellationToken)
    {
        var command = new CreateReportCommand(request.Reason, request.Description);
        var result = await reports.CreateForCommentAsync(User.ToActor(), id, command, cancellationToken);
        return result.ToActionResult(this, view => Created($"/api/comments/{id}/reports", view));
    }
}
