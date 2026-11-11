using LGSApp.Infrastructure.Services.Common;
using Microsoft.AspNetCore.Mvc;

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

    private static ObjectResult Failure(ControllerBase controller, IServiceResult result)
    {
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
