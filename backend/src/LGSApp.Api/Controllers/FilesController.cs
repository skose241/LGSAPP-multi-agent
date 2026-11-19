using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Api.Filters;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Files;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/files")]
[Authorize(Policy = Policies.Kullanici)]
public class FilesController(IFileUploadService files, IOptions<UploadOptions> uploadOptions) : ControllerBase
{
    [HttpPost]
    [Consumes("multipart/form-data")]
    [EnableRateLimiting(RateLimitingExtensions.FileUploadPolicy)]
    [TypeFilter(typeof(UploadRequestSizeFilter))]
    [ProducesResponseType<FileView>(StatusCodes.Status201Created)]
    [ProducesResponseType<FileView>(StatusCodes.Status200OK)]
    [ProducesResponseType<HttpValidationProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status413PayloadTooLarge, "application/problem+json")]
    public async Task<IActionResult> Upload(CancellationToken cancellationToken)
    {
        IFormCollection form;
        try
        {
            form = await Request.ReadFormAsync(cancellationToken);
        }
        catch (BadHttpRequestException ex) when (ex.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            return Problem(
                statusCode: StatusCodes.Status413PayloadTooLarge,
                title: "Dosya çok büyük.",
                detail: SkiaImageProcessor.TooLargeMessage(uploadOptions.Value.MaxBytes));
        }
        catch (Exception ex) when (ex is InvalidDataException or BadHttpRequestException or InvalidOperationException)
        {
            return Failure(FileErrors.FileKey, "İstek gövdesi okunamadı.");
        }

        var purpose = ParsePurpose(form["purpose"].ToString());
        if (purpose is null)
        {
            return Failure("purpose", "Dosya amacı geçersiz.");
        }

        var file = form.Files.GetFile("file");
        if (file is null || file.Length == 0)
        {
            return Failure(FileErrors.FileKey, "Dosya zorunludur.", FileEmptyCode);
        }

        if (!Guid.TryParse(form["clientUploadId"].ToString(), out var clientUploadId) || clientUploadId == Guid.Empty)
        {
            return Failure("clientUploadId", "Yükleme kimliği zorunludur.");
        }

        if (file.Length > uploadOptions.Value.MaxBytes)
        {
            return Problem(
                statusCode: StatusCodes.Status413PayloadTooLarge,
                title: "Dosya çok büyük.",
                detail: SkiaImageProcessor.TooLargeMessage(uploadOptions.Value.MaxBytes));
        }

        await using var stream = file.OpenReadStream();
        var result = await files.UploadAsync(User.ToActor(), purpose.Value, clientUploadId, stream, cancellationToken);
        return result.ToActionResult(this, outcome => outcome.Created
            ? Created($"/api/files/{outcome.File.Id}", outcome.File)
            : Ok(outcome.File));
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType<FileView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(int id, CancellationToken cancellationToken) =>
        (await files.GetAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        (await files.DeleteAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    private static FilePurpose? ParsePurpose(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "questionimage" => FilePurpose.QuestionImage,
        "solutionimage" => FilePurpose.SolutionImage,
        "assignmentimage" => FilePurpose.AssignmentImage,
        "avatar" => FilePurpose.Avatar,
        _ => null
    };

    public const string ErrorCodeExtension = "code";
    public const string FileEmptyCode = "file_empty";

    private IActionResult Failure(string key, string message, string? code = null)
    {
        var modelState = new ModelStateDictionary();
        modelState.AddModelError(key, message);
        var result = ValidationProblem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Bir veya daha fazla doğrulama hatası oluştu.",
            modelStateDictionary: modelState);
        if (code is not null && result is ObjectResult { Value: ProblemDetails problem })
        {
            problem.Extensions[ErrorCodeExtension] = code;
        }

        return result;
    }
}
