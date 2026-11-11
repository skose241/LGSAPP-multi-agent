using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Solutions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/solutions")]
[Authorize(Policy = Policies.OgretmenOrMudur)]
public class SolutionsController(ISolutionService solutions) : ControllerBase
{
    [HttpPatch("{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateSolutionRequest request, CancellationToken cancellationToken)
    {
        var command = new UpdateSolutionCommand(request.Text, request.ImageFileId, request.RowVersion);
        return (await solutions.UpdateAsync(User.ToActor(), id, command, cancellationToken)).ToActionResult(this);
    }
}
