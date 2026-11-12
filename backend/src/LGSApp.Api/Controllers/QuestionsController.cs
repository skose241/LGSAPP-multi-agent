using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Answers;
using LGSApp.Infrastructure.Services.Likes;
using LGSApp.Infrastructure.Services.Questions;
using LGSApp.Infrastructure.Services.Solutions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/questions")]
[Authorize(Policy = Policies.Kullanici)]
public class QuestionsController(IQuestionService questions, IQuestionAuthoringService authoring, IAnswerService answers, ISolutionService solutions, IAnswerKeyService answerKeys, ILikeService likes) : ControllerBase
{
    [HttpPost]
    [EnableRateLimiting(RateLimitingExtensions.QuestionCreatePolicy)]
    public async Task<IActionResult> Create(CreateQuestionRequest request, CancellationToken cancellationToken)
    {
        var command = new CreateQuestionCommand(
            request.LessonId,
            request.TopicId,
            request.Text,
            request.ImageFileId,
            request.OptionA,
            request.OptionB,
            request.OptionC,
            request.OptionD,
            request.CorrectOption,
            request.Description,
            request.ScheduledPublishDate);
        var result = await authoring.CreateAsync(User.ToActor(), command, cancellationToken);
        return result.ToActionResult(this, view => Created($"/api/questions/{view.Id}", view));
    }

    [HttpGet("mine")]
    public async Task<IActionResult> Mine([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken cancellationToken = default) =>
        (await authoring.ListMineAsync(User.ToActor(), page, pageSize, cancellationToken)).ToActionResult(this);

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

    [HttpPut("{id:int}/correct-option")]
    [Authorize(Policy = Policies.OgretmenOrMudur)]
    public async Task<IActionResult> ChangeCorrectOption(int id, ChangeCorrectOptionRequest request, CancellationToken cancellationToken)
    {
        var command = new ChangeAnswerKeyCommand(request.CorrectOption, request.RowVersion, request.Note);
        return (await answerKeys.ChangeAsync(User.ToActor(), id, command, cancellationToken)).ToActionResult(this);
    }

    [HttpPut("{id:int}/like")]
    public async Task<IActionResult> Like(int id, CancellationToken cancellationToken) =>
        (await likes.LikeAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    [HttpDelete("{id:int}/like")]
    public async Task<IActionResult> Unlike(int id, CancellationToken cancellationToken) =>
        (await likes.UnlikeAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

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
