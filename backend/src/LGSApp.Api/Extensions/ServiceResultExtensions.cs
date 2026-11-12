using LGSApp.Infrastructure.Services.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace LGSApp.Api.Extensions;

public static class ServiceResultExtensions
{
    public static IActionResult ToActionResult(this ServiceResult result, ControllerBase controller, Func<IActionResult>? onSuccess = null) =>
        result.Succeeded ? onSuccess?.Invoke() ?? controller.NoContent() : Failure(controller, result);

    public static IActionResult ToActionResult<T>(this ServiceResult<T> result, ControllerBase controller, Func<T, IActionResult>? onSuccess = null)
    {
        if (!result.Succeeded)
        {
            return Failure(controller, result);
        }

        return onSuccess is null ? controller.Ok(result.Value) : onSuccess(result.Value!);
    }

    private static IActionResult Failure(ControllerBase controller, IServiceResult result)
    {
        if (result.Error == ServiceErrorKind.Validation && result.Errors is { Count: > 0 } errors)
        {
            var modelState = new ModelStateDictionary();
            foreach (var (key, messages) in errors)
            {
                foreach (var message in messages)
                {
                    modelState.AddModelError(key, message);
                }
            }

            return controller.ValidationProblem(
                detail: result.Message,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Bir veya daha fazla doğrulama hatası oluştu.",
                modelStateDictionary: modelState);
        }

        var (status, title) = result.Error switch
        {
            ServiceErrorKind.NotFound => (StatusCodes.Status404NotFound, "Kayıt bulunamadı."),
            ServiceErrorKind.Forbidden => (StatusCodes.Status403Forbidden, "Bu işlem için yetkiniz yok."),
            ServiceErrorKind.Conflict => (StatusCodes.Status409Conflict, "İşlem çakışması oluştu."),
            ServiceErrorKind.Validation => (StatusCodes.Status400BadRequest, "Geçersiz istek."),
            _ => (StatusCodes.Status500InternalServerError, "Sunucuda beklenmeyen bir hata oluştu.")
        };

        return controller.Problem(statusCode: status, title: title, detail: result.Message);
    }
}
