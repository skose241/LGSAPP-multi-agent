using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Students;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/students")]
[Authorize(Policy = Policies.OgretmenOrMudur)]
public class StudentsController(IStudentDirectoryService students) : ControllerBase
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
}
