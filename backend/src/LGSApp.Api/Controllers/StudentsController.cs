using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Students;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/students")]
[Authorize(Policy = Policies.OgretmenOrMudur)]
public class StudentsController(IStudentDirectoryService students, IStudentActivityService activity) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<StudentListView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] string? sort,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = StudentDirectoryRules.DefaultPageSize,
        CancellationToken cancellationToken = default) =>
        (await students.ListAsync(User.ToActor(), new StudentListQuery(search, sort, page, pageSize), cancellationToken)).ToActionResult(this);

    [HttpGet("{id:int}/stats")]
    [ProducesResponseType<StudentProfileStatsView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Stats(int id, CancellationToken cancellationToken) =>
        (await students.GetStatsAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    [HttpGet("{id:int}/questions")]
    [ProducesResponseType<StudentUploadsView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Questions(
        int id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = StudentDirectoryRules.DefaultPageSize,
        CancellationToken cancellationToken = default) =>
        (await activity.ListUploadsAsync(User.ToActor(), id, page, pageSize, cancellationToken)).ToActionResult(this);

    [HttpGet("{id:int}/answers")]
    [ProducesResponseType<StudentAnswersView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Answers(
        int id,
        [FromQuery] int? lessonId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = StudentDirectoryRules.DefaultPageSize,
        CancellationToken cancellationToken = default) =>
        (await activity.ListAnswersAsync(User.ToActor(), id, lessonId, page, pageSize, cancellationToken)).ToActionResult(this);
}
