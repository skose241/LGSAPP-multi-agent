using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Lessons;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/lessons")]
[Authorize(Policy = Policies.Kullanici)]
public class LessonsController(ILessonService lessons) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<LessonView>>> List(CancellationToken cancellationToken) =>
        Ok(await lessons.GetLessonsAsync(cancellationToken));

    [HttpGet("{id:int}/topics")]
    public async Task<IActionResult> Topics(int id, CancellationToken cancellationToken) =>
        (await lessons.GetTopicsAsync(id, cancellationToken)).ToActionResult(this);
}
