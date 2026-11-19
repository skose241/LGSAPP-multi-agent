using LGSApp.Api.Controllers;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Files;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace LGSApp.Tests.Api;

public class FilesControllerTests
{
    private static async Task<ObjectResult> UploadAsync(Action<FormFileCollection> addFiles)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddControllers();
        var provider = services.BuildServiceProvider();

        var files = new FormFileCollection();
        addFiles(files);
        var form = new FormCollection(
            new Dictionary<string, Microsoft.Extensions.Primitives.StringValues>
            {
                ["purpose"] = "questionImage",
                ["clientUploadId"] = Guid.NewGuid().ToString()
            },
            files);

        var context = new DefaultHttpContext { RequestServices = provider };
        context.Features.Set<IFormFeature>(new FormFeature(form));

        var controller = new FilesController(null!, Options.Create(new UploadOptions()))
        {
            ControllerContext = new ControllerContext { HttpContext = context }
        };

        return Assert.IsAssignableFrom<ObjectResult>(await controller.Upload(CancellationToken.None));
    }

    [Fact]
    public async Task Missing_file_returns_400_with_file_empty_code()
    {
        var result = await UploadAsync(_ => { });

        var problem = Assert.IsAssignableFrom<ProblemDetails>(result.Value);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.Status ?? result.StatusCode);
        Assert.Equal("file_empty", problem.Extensions["code"]?.ToString());
        var errors = Assert.IsType<ValidationProblemDetails>(problem).Errors;
        Assert.Equal("Dosya zorunludur.", Assert.Single(errors["file"]));
    }

    [Fact]
    public async Task Zero_length_file_returns_400_with_file_empty_code()
    {
        var result = await UploadAsync(files =>
            files.Add(new FormFile(new MemoryStream(), 0, 0, "file", "a.jpg")));

        var problem = Assert.IsAssignableFrom<ProblemDetails>(result.Value);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.Status ?? result.StatusCode);
        Assert.Equal("file_empty", problem.Extensions["code"]?.ToString());
    }

    [Fact]
    public async Task Invalid_purpose_has_no_code()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddControllers();
        var context = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
        context.Features.Set<IFormFeature>(new FormFeature(new FormCollection(
            new Dictionary<string, Microsoft.Extensions.Primitives.StringValues> { ["purpose"] = "x" })));
        var controller = new FilesController(null!, Options.Create(new UploadOptions()))
        {
            ControllerContext = new ControllerContext { HttpContext = context }
        };

        var result = Assert.IsAssignableFrom<ObjectResult>(await controller.Upload(CancellationToken.None));

        var problem = Assert.IsAssignableFrom<ProblemDetails>(result.Value);
        Assert.False(problem.Extensions.ContainsKey("code"));
    }
}
