using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Ai;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/admin/disputed-questions")]
[Authorize(Policy = Policies.OgretmenOrMudur)]
public class AdminDisputedQuestionsController(IAnswerDisputeService disputes) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<DisputedQuestionListView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(
        [FromQuery] int? lessonId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default) =>
        (await disputes.ListAsync(User.ToActor(), new DisputedQuestionListQuery(lessonId, page, pageSize), cancellationToken)).ToActionResult(this);
}
