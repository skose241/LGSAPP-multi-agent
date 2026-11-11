using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Answers;
using LGSApp.Infrastructure.Services.Questions;
using LGSApp.Infrastructure.Services.Solutions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/questions")]
[Authorize(Policy = Policies.Kullanici)]
public class QuestionsController(IQuestionService questions, IAnswerService answers, ISolutionService solutions) : ControllerBase
{
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Detail(int id, CancellationToken cancellationToken) =>
        (await questions.GetDetailAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    [HttpPost("{id:int}/answers")]
    [Authorize(Policy = Policies.OgrenciOnly)]
    [EnableRateLimiting(RateLimitingExtensions.AnswerSubmitPolicy)]
    public async Task<IActionResult> Submit(int id, SubmitAnswerRequest request, CancellationToken cancellationToken)
    {
        var command = new SubmitAnswerCommand(request.SelectedOption, request.SolutionText, request.SolutionImageFileId);
        return (await answers.SubmitAsync(User.ToActor(), id, command, cancellationToken)).ToActionResult(this);
    }

    [HttpGet("{id:int}/solutions")]
    public async Task<IActionResult> Solutions(int id, CancellationToken cancellationToken) =>
        (await solutions.ListAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    [HttpPost("{id:int}/solutions/teacher")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    public async Task<IActionResult> CreateTeacherSolution(int id, CreateTeacherSolutionRequest request, CancellationToken cancellationToken)
    {
        var command = new CreateTeacherSolutionCommand(request.Text, request.ImageFileId);
        var result = await solutions.CreateTeacherAsync(User.ToActor(), id, command, cancellationToken);
        return result.ToActionResult(this, view => Created($"/api/questions/{id}/solutions", view));
    }
}
