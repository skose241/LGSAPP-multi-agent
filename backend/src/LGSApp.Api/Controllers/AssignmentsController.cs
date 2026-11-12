using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Assignments;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/assignments")]
[Authorize(Policy = Policies.Kullanici)]
public class AssignmentsController(
    IAssignmentManagementService management,
    IAssignmentQuestionService questions,
    IAssignmentStudentService students) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? state,
        [FromQuery] int? lessonId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        AssignmentEffectiveState parsed;
        if (string.IsNullOrWhiteSpace(state))
        {
            parsed = AssignmentEffectiveState.Open;
        }
        else if (!AssignmentState.TryParse(state, out parsed) || parsed is not (AssignmentEffectiveState.Open or AssignmentEffectiveState.Closed))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Geçersiz istek.", detail: "Durum 'open' veya 'closed' olmalıdır.");
        }

        return (await students.ListAsync(User.ToActor(), parsed, lessonId, page, pageSize, cancellationToken)).ToActionResult(this);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Detail(int id, CancellationToken cancellationToken) =>
        (await students.GetAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    [HttpPost]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> Create(CreateAssignmentRequest request, CancellationToken cancellationToken)
    {
        var command = new CreateAssignmentCommand(request.LessonId, request.Title, request.Description, request.StartDate, request.EndDate);
        var result = await management.CreateAsync(User.ToActor(), command, cancellationToken);
        return result.ToActionResult(this, view => Created($"/api/assignments/{view.Id}/manage", view));
    }

    [HttpPatch("{id:int}")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> Update(int id, UpdateAssignmentRequest request, CancellationToken cancellationToken)
    {
        var command = new UpdateAssignmentCommand(request.Title, request.Description, request.StartDate, request.EndDate, request.RowVersion);
        return (await management.UpdateAsync(User.ToActor(), id, command, cancellationToken)).ToActionResult(this);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> Delete(int id, [FromQuery] byte[]? rowVersion, CancellationToken cancellationToken) =>
        (await management.DeleteAsync(User.ToActor(), id, rowVersion, cancellationToken)).ToActionResult(this);

    [HttpGet("manage")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    public async Task<IActionResult> ManageList(
        [FromQuery] string? status,
        [FromQuery] int? lessonId,
        [FromQuery] bool mine = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        AssignmentEffectiveState? parsed = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!AssignmentState.TryParse(status, out var value))
            {
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Geçersiz istek.", detail: "Durum 'draft', 'scheduled', 'open' veya 'closed' olmalıdır.");
            }

            parsed = value;
        }

        var query = new AssignmentManageQuery(parsed, lessonId, mine, page, pageSize);
        return (await management.ListAsync(User.ToActor(), query, cancellationToken)).ToActionResult(this);
    }

    [HttpGet("{id:int}/manage")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    public async Task<IActionResult> ManageDetail(int id, CancellationToken cancellationToken) =>
        (await management.GetAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    [HttpPost("{id:int}/publish")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> Publish(int id, AssignmentRowVersionRequest request, CancellationToken cancellationToken) =>
        (await management.PublishAsync(User.ToActor(), id, request.RowVersion, cancellationToken)).ToActionResult(this);

    [HttpPost("{id:int}/unpublish")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> Unpublish(int id, AssignmentRowVersionRequest request, CancellationToken cancellationToken) =>
        (await management.UnpublishAsync(User.ToActor(), id, request.RowVersion, cancellationToken)).ToActionResult(this);

    [HttpGet("{id:int}/results")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    public async Task<IActionResult> Results(
        int id,
        [FromQuery] string? sort,
        [FromQuery] string? dir,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken cancellationToken = default)
    {
        AssignmentResultSort parsedSort;
        switch (sort?.Trim().ToLowerInvariant())
        {
            case null:
            case "":
            case "completion":
                parsedSort = AssignmentResultSort.Completion;
                break;
            case "name":
                parsedSort = AssignmentResultSort.Name;
                break;
            case "correct":
                parsedSort = AssignmentResultSort.Correct;
                break;
            case "lastanswered":
                parsedSort = AssignmentResultSort.LastAnswered;
                break;
            default:
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Geçersiz istek.", detail: "Sıralama 'completion', 'name', 'correct' veya 'lastAnswered' olmalıdır.");
        }

        bool descending;
        if (string.IsNullOrWhiteSpace(dir))
        {
            descending = parsedSort != AssignmentResultSort.Name;
        }
        else if (dir.Equals("desc", StringComparison.OrdinalIgnoreCase))
        {
            descending = true;
        }
        else if (dir.Equals("asc", StringComparison.OrdinalIgnoreCase))
        {
            descending = false;
        }
        else
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Geçersiz istek.", detail: "Yön 'asc' veya 'desc' olmalıdır.");
        }

        var query = new AssignmentResultsQuery(parsedSort, descending, page, pageSize);
        return (await management.ResultsAsync(User.ToActor(), id, query, cancellationToken)).ToActionResult(this);
    }

    [HttpPost("{id:int}/questions")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> AddQuestions(int id, AddAssignmentQuestionsRequest request, CancellationToken cancellationToken)
    {
        var items = request.Items
            .Select(i => i is null ? null : new NewAssignmentQuestion(i.Text, i.ImageFileId, i.OptionA, i.OptionB, i.OptionC, i.OptionD, i.CorrectOption, i.TopicId, i.Description))
            .ToList();
        var result = await questions.AddAsync(User.ToActor(), id, items, cancellationToken);
        return result.ToActionResult(this, view => Created($"/api/assignments/{id}/manage", view));
    }

    [HttpPost("{id:int}/questions/attach")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> AttachQuestions(int id, AssignmentQuestionIdsRequest request, CancellationToken cancellationToken)
    {
        var result = await questions.AttachAsync(User.ToActor(), id, request.QuestionIds, cancellationToken);
        return result.ToActionResult(this, view => Created($"/api/assignments/{id}/manage", view));
    }

    [HttpPut("{id:int}/questions/order")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> Reorder(int id, AssignmentQuestionIdsRequest request, CancellationToken cancellationToken) =>
        (await questions.ReorderAsync(User.ToActor(), id, request.QuestionIds, cancellationToken)).ToActionResult(this);

    [HttpPatch("{id:int}/questions/{questionId:int}")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> UpdateQuestion(int id, int questionId, UpdateAssignmentQuestionRequest request, CancellationToken cancellationToken)
    {
        var command = new UpdateAssignmentQuestionCommand(
            request.Text,
            request.ImageFileId,
            request.OptionA,
            request.OptionB,
            request.OptionC,
            request.OptionD,
            request.CorrectOption,
            request.TopicId,
            request.Description,
            request.RowVersion);
        return (await questions.UpdateAsync(User.ToActor(), id, questionId, command, cancellationToken)).ToActionResult(this);
    }

    [HttpDelete("{id:int}/questions/{questionId:int}")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    [EnableRateLimiting(RateLimitingExtensions.AssignmentWritePolicy)]
    public async Task<IActionResult> RemoveQuestion(int id, int questionId, CancellationToken cancellationToken) =>
        (await questions.RemoveAsync(User.ToActor(), id, questionId, cancellationToken)).ToActionResult(this);
}
