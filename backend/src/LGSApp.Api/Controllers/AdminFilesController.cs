using LGSApp.Api.Authorization;
using LGSApp.Infrastructure.Services.Files;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/admin/files")]
[Authorize(Policy = Policies.MudurOnly)]
public class AdminFilesController(IFileCleanupService cleanup) : ControllerBase
{
    [HttpPost("cleanup")]
    [ProducesResponseType<FileCleanupResult>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Cleanup(CancellationToken cancellationToken) =>
        Ok(await cleanup.RunAsync(cancellationToken));
}
