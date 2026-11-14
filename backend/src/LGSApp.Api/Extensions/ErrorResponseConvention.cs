using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApplicationModels;
using Microsoft.AspNetCore.Mvc.ActionConstraints;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.RateLimiting;

namespace LGSApp.Api.Extensions;

public sealed class ErrorResponseConvention : IActionModelConvention
{
    private const string ProblemContentType = "application/problem+json";

    private static readonly HashSet<string> ControllersWithoutConflict = ["AuthController", "RecoveryController", "NotificationsController"];

    private static readonly HashSet<string> ActionsWithoutConflict =
    [
        "QuestionsController.Like",
        "QuestionsController.Unlike",
        "AdminSettingsController.Update",
        "AdminFilesController.Cleanup",
        "AdminGenerationScheduleController.Replace",
        "AdminUsersController.Ban",
        "AdminUsersController.Unban",
        "AdminUsersController.RegeneratePassword"
    ];

    private static readonly HashSet<string> ReadsWithConflict = ["FilesController.Get"];

    private static readonly HashSet<string> BodyActionsWithNotFound = ["QuestionsController.Create", "AssignmentsController.Create"];

    public void Apply(ActionModel action)
    {
        var controller = action.Controller;
        var methods = action.Selectors
            .SelectMany(s => s.ActionConstraints)
            .OfType<HttpMethodActionConstraint>()
            .SelectMany(c => c.HttpMethods)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var templates = action.Selectors
            .Select(s => s.AttributeRouteModel?.Template)
            .Concat(controller.Selectors.Select(s => s.AttributeRouteModel?.Template))
            .Where(t => t is not null)
            .ToList();
        var hasRouteValues = templates.Any(t => t!.Contains('{'));
        var hasInput = action.ActionMethod.GetParameters().Any(p => p.ParameterType != typeof(CancellationToken));
        var attributes = controller.Attributes.Concat(action.Attributes).ToList();
        var anonymous = action.Attributes.OfType<IAllowAnonymous>().Any();
        var authorized = !anonymous && attributes.OfType<IAuthorizeData>().Any();
        var rateLimited = attributes.OfType<EnableRateLimitingAttribute>().Any();
        var key = $"{controller.ControllerName}Controller.{action.ActionName}";
        var conflicts = !ControllersWithoutConflict.Contains($"{controller.ControllerName}Controller")
            && !ActionsWithoutConflict.Contains(key)
            && (methods.Overlaps(["POST", "PUT", "PATCH", "DELETE"]) || ReadsWithConflict.Contains(key));

        AddImplicitSuccess(action);

        if (hasInput)
        {
            Add(action, typeof(HttpValidationProblemDetails), StatusCodes.Status400BadRequest);
        }

        if (authorized)
        {
            Add(action, typeof(ProblemDetails), StatusCodes.Status401Unauthorized);
            Add(action, typeof(ProblemDetails), StatusCodes.Status403Forbidden);
        }

        if (hasRouteValues || BodyActionsWithNotFound.Contains(key))
        {
            Add(action, typeof(ProblemDetails), StatusCodes.Status404NotFound);
        }

        if (conflicts)
        {
            Add(action, typeof(ProblemDetails), StatusCodes.Status409Conflict);
        }

        if (rateLimited)
        {
            Add(action, typeof(ProblemDetails), StatusCodes.Status429TooManyRequests);
        }

        Add(action, typeof(ProblemDetails), StatusCodes.Status500InternalServerError);
    }

    private static void AddImplicitSuccess(ActionModel action)
    {
        var declaresSuccess = action.Filters
            .OfType<IApiResponseMetadataProvider>()
            .Any(p => p.StatusCode is >= 200 and < 300);
        if (declaresSuccess)
        {
            return;
        }

        var returnType = action.ActionMethod.ReturnType;
        if (returnType.IsGenericType && returnType.GetGenericTypeDefinition() == typeof(Task<>))
        {
            returnType = returnType.GetGenericArguments()[0];
        }

        if (returnType.IsGenericType && returnType.GetGenericTypeDefinition() == typeof(ActionResult<>))
        {
            action.Filters.Add(new ProducesResponseTypeAttribute(returnType.GetGenericArguments()[0], StatusCodes.Status200OK));
        }
    }

    private static void Add(ActionModel action, Type type, int status)
    {
        var declared = action.Filters
            .OfType<IApiResponseMetadataProvider>()
            .Any(p => p.StatusCode == status);
        if (declared)
        {
            return;
        }

        action.Filters.Add(new ProducesResponseTypeAttribute(type, status, ProblemContentType));
    }
}
