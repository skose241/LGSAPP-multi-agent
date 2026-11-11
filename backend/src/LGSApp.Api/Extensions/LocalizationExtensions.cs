using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.WebUtilities;

namespace LGSApp.Api.Extensions;

public static class LocalizationExtensions
{
    private const string ValidationTitle = "Bir veya daha fazla doğrulama hatası oluştu.";

    private static readonly Dictionary<int, string> Titles = new()
    {
        [StatusCodes.Status400BadRequest] = "Geçersiz istek.",
        [StatusCodes.Status401Unauthorized] = "Kimlik doğrulaması gerekli.",
        [StatusCodes.Status403Forbidden] = "Bu işlem için yetkiniz yok.",
        [StatusCodes.Status404NotFound] = "Kayıt bulunamadı.",
        [StatusCodes.Status405MethodNotAllowed] = "Bu istek yöntemine izin verilmiyor.",
        [StatusCodes.Status406NotAcceptable] = "İstenen yanıt biçimi desteklenmiyor.",
        [StatusCodes.Status409Conflict] = "İşlem çakışması oluştu.",
        [StatusCodes.Status415UnsupportedMediaType] = "Desteklenmeyen içerik türü.",
        [StatusCodes.Status422UnprocessableEntity] = "İstek işlenemedi.",
        [StatusCodes.Status429TooManyRequests] = "Çok fazla istek gönderildi.",
        [StatusCodes.Status500InternalServerError] = "Sunucuda beklenmeyen bir hata oluştu."
    };

    public static IServiceCollection AddTurkishProblemDetails(this IServiceCollection services)
    {
        services.AddProblemDetails(options =>
        {
            options.CustomizeProblemDetails = context =>
            {
                var details = context.ProblemDetails;
                var status = details.Status ?? context.HttpContext.Response.StatusCode;
                if (details.Status is null)
                {
                    details.Status = status;
                }

                if (Titles.TryGetValue(status, out var title) && IsDefaultEnglishTitle(details.Title, status))
                {
                    details.Title = title;
                }
            };
        });

        services.Configure<ApiBehaviorOptions>(options =>
        {
            foreach (var (code, title) in Titles)
            {
                if (options.ClientErrorMapping.TryGetValue(code, out var mapping))
                {
                    mapping.Title = title;
                }
                else
                {
                    options.ClientErrorMapping[code] = new ClientErrorData { Title = title };
                }
            }

            options.InvalidModelStateResponseFactory = context =>
            {
                var factory = context.HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
                var problem = factory.CreateValidationProblemDetails(
                    context.HttpContext,
                    Sanitize(context.ModelState),
                    StatusCodes.Status400BadRequest,
                    title: ValidationTitle);
                var result = new ObjectResult(problem) { StatusCode = StatusCodes.Status400BadRequest };
                result.ContentTypes.Add("application/problem+json");
                result.ContentTypes.Add("application/problem+xml");
                return result;
            };
        });

        return services;
    }

    public static IApplicationBuilder UseProblemJsonCharset(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            context.Response.OnStarting(static state =>
            {
                var response = (HttpResponse)state;
                var contentType = response.ContentType;
                if (contentType is not null
                    && contentType.StartsWith("application/problem+json", StringComparison.OrdinalIgnoreCase)
                    && !contentType.Contains("charset", StringComparison.OrdinalIgnoreCase))
                {
                    response.ContentType = contentType + "; charset=utf-8";
                }

                return Task.CompletedTask;
            }, context.Response);

            await next();
        });

    public static IMvcBuilder AddTurkishModelBinding(this IMvcBuilder builder) =>
        builder.AddMvcOptions(options =>
        {
            options.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true;

            var messages = options.ModelBindingMessageProvider;
            messages.SetValueMustNotBeNullAccessor(_ => "Bu alan zorunludur.");
            messages.SetMissingBindRequiredValueAccessor(name => $"'{name}' alanı için bir değer belirtilmelidir.");
            messages.SetMissingKeyOrValueAccessor(() => "Bir anahtar ve değer belirtilmelidir.");
            messages.SetMissingRequestBodyRequiredValueAccessor(() => "İstek gövdesi boş olamaz.");
            messages.SetAttemptedValueIsInvalidAccessor((value, name) => $"'{value}' değeri '{name}' alanı için geçerli değil.");
            messages.SetNonPropertyAttemptedValueIsInvalidAccessor(value => $"'{value}' değeri geçerli değil.");
            messages.SetUnknownValueIsInvalidAccessor(name => $"'{name}' alanı için sağlanan değer geçerli değil.");
            messages.SetNonPropertyUnknownValueIsInvalidAccessor(() => "Sağlanan değer geçerli değil.");
            messages.SetValueIsInvalidAccessor(value => $"'{value}' değeri geçerli değil.");
            messages.SetValueMustBeANumberAccessor(name => $"'{name}' alanı bir sayı olmalıdır.");
            messages.SetNonPropertyValueMustBeANumberAccessor(() => "Alan bir sayı olmalıdır.");
        });

    private static ModelStateDictionary Sanitize(ModelStateDictionary source)
    {
        var result = new ModelStateDictionary();
        foreach (var (key, entry) in source)
        {
            foreach (var error in entry.Errors)
            {
                var isJsonPath = key == "$" || key.StartsWith("$.", StringComparison.Ordinal);
                if (error.Exception is null && !isJsonPath)
                {
                    result.AddModelError(key, error.ErrorMessage);
                    continue;
                }

                var field = key.StartsWith("$.", StringComparison.Ordinal) ? key[2..] : key;
                if (string.IsNullOrWhiteSpace(field) || field == "$")
                {
                    result.AddModelError(string.Empty, "İstek gövdesi geçerli bir JSON değil.");
                }
                else
                {
                    result.AddModelError(field, $"'{field}' alanının değeri geçersiz.");
                }
            }
        }

        return result;
    }

    private static bool IsDefaultEnglishTitle(string? title, int status)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            return true;
        }

        return title == ReasonPhrases.GetReasonPhrase(status)
            || title == "An error occurred while processing your request."
            || title == "One or more validation errors occurred.";
    }
}
