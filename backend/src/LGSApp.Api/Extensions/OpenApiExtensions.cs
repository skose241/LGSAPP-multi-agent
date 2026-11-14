using System.Text.Json.Nodes;
using Microsoft.OpenApi;

namespace LGSApp.Api.Extensions;

public static class OpenApiExtensions
{
    public static IServiceCollection AddOpenApiWithJwt(this IServiceCollection services)
    {
        services.AddOpenApi(options =>
        {
            options.AddSchemaTransformer((schema, context, cancellationToken) =>
            {
                if (context.JsonTypeInfo.Type == typeof(Microsoft.AspNetCore.Mvc.ProblemDetails)
                    || context.JsonTypeInfo.Type == typeof(Microsoft.AspNetCore.Http.HttpValidationProblemDetails))
                {
                    schema.Properties ??= new Dictionary<string, IOpenApiSchema>();
                    schema.Properties["traceId"] = new OpenApiSchema { Type = JsonSchemaType.String | JsonSchemaType.Null };
                }

                if (schema.Type is null
                    && schema.Enum is { Count: > 0 } values
                    && values.All(v => v is JsonValue value && value.GetValueKind() == System.Text.Json.JsonValueKind.String))
                {
                    schema.Type = JsonSchemaType.String;
                }

                if (schema.Type is { } type
                    && type.HasFlag(JsonSchemaType.String)
                    && (type.HasFlag(JsonSchemaType.Integer) || type.HasFlag(JsonSchemaType.Number)))
                {
                    schema.Type = type & ~JsonSchemaType.String;
                    schema.Pattern = null;
                }

                return Task.CompletedTask;
            });
            options.AddOperationTransformer((operation, context, cancellationToken) =>
            {
                foreach (var parameter in operation.Parameters ?? [])
                {
                    if (parameter.Schema is OpenApiSchema { Type: { } type } schema
                        && (type.HasFlag(JsonSchemaType.Integer) || type.HasFlag(JsonSchemaType.Number)))
                    {
                        schema.Pattern = null;
                    }
                }

                if (operation.RequestBody?.Content is { } requestContent)
                {
                    RemoveAlternateContentTypes(requestContent);
                }

                if (operation.Responses is not null)
                {
                    if (operation.Responses.TryGetValue("201", out var created) && created is OpenApiResponse createdResponse)
                    {
                        createdResponse.Headers ??= new Dictionary<string, IOpenApiHeader>();
                        createdResponse.Headers["Location"] = new OpenApiHeader
                        {
                            Description = "Oluşturulan kaynağın adresi.",
                            Schema = new OpenApiSchema { Type = JsonSchemaType.String }
                        };
                    }

                    foreach (var response in operation.Responses.Values)
                    {
                        if (response.Content is { } content)
                        {
                            RemoveAlternateContentTypes(content);
                        }
                    }
                }

                return Task.CompletedTask;
            });
            options.AddDocumentTransformer((document, context, cancellationToken) =>
            {
                document.Components ??= new OpenApiComponents();
                document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
                document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
                {
                    Type = SecuritySchemeType.Http,
                    Scheme = "bearer",
                    BearerFormat = "JWT"
                };
                document.Security ??= new List<OpenApiSecurityRequirement>();
                document.Security.Add(new OpenApiSecurityRequirement
                {
                    [new OpenApiSecuritySchemeReference("Bearer", document)] = new List<string>()
                });
                return Task.CompletedTask;
            });
        });

        return services;
    }

    private static void RemoveAlternateContentTypes(IDictionary<string, OpenApiMediaType> content)
    {
        var alternates = content.Keys
            .Where(k => k is "text/plain" or "text/json" || k.EndsWith("+json", StringComparison.Ordinal) && k != "application/problem+json")
            .ToList();
        foreach (var key in alternates)
        {
            content.Remove(key);
        }
    }
}
