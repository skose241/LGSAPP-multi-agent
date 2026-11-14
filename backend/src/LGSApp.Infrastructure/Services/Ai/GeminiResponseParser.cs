using System.Globalization;
using System.Text;
using System.Text.Json;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;

namespace LGSApp.Infrastructure.Services.Ai;

public sealed record GeminiParsedResponse(
    bool Succeeded,
    AiErrorKind ErrorKind,
    string? Json,
    string? FinishReason,
    int? InputTokens,
    int? OutputTokens,
    int? ThinkingTokens,
    string? ModelVersion,
    string? ResponseId,
    string? ErrorMessage,
    TimeSpan? RetryDelay);

public static class GeminiResponseParser
{
    private static readonly HashSet<string> BlockedFinishReasons = new(StringComparer.OrdinalIgnoreCase)
    {
        "SAFETY", "PROHIBITED_CONTENT", "RECITATION", "BLOCKLIST", "SPII", "IMAGE_SAFETY"
    };

    public static GeminiParsedResponse Parse(int httpStatus, string? body, TimeSpan? retryAfterHeader = null) =>
        httpStatus is >= 200 and < 300 ? ParseSuccess(body) : ParseError(httpStatus, body, retryAfterHeader);

    public static TimeSpan? ParseDuration(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var text = value.Trim();
        if (text.EndsWith('s'))
        {
            text = text[..^1];
        }

        return double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds)
            && double.IsFinite(seconds) && seconds >= 0 && seconds < 86400
            ? TimeSpan.FromSeconds(seconds)
            : null;
    }

    public static string? Truncate(string? value, int max = AiRules.ErrorMessageMaxLength) =>
        value is not null && value.Length > max ? value[..max] : value;

    private static GeminiParsedResponse ParseSuccess(string? body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return Fail(AiErrorKind.InvalidOutput, "Yanıt gövdesi boş.");
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(body);
        }
        catch (JsonException)
        {
            return Fail(AiErrorKind.InvalidOutput, "Yanıt geçerli bir JSON değil.");
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return Fail(AiErrorKind.InvalidOutput, "Yanıt biçimi beklenmeyen.");
            }

            var input = ReadInt(root, "usageMetadata", "promptTokenCount");
            var output = ReadInt(root, "usageMetadata", "candidatesTokenCount");
            var thinking = ReadInt(root, "usageMetadata", "thoughtsTokenCount");
            var modelVersion = Truncate(ReadString(root, "modelVersion"), AiRules.ModelVersionMaxLength);
            var responseId = Truncate(ReadString(root, "responseId"), 120);

            GeminiParsedResponse With(AiErrorKind kind, string? message, string? finish) =>
                new(false, kind, null, finish, input, output, thinking, modelVersion, responseId, message, null);

            var blockReason = root.TryGetProperty("promptFeedback", out var feedback) && feedback.ValueKind == JsonValueKind.Object
                ? ReadString(feedback, "blockReason")
                : null;

            if (!root.TryGetProperty("candidates", out var candidates) || candidates.ValueKind != JsonValueKind.Array || candidates.GetArrayLength() == 0)
            {
                return blockReason is not null
                    ? With(AiErrorKind.Blocked, $"İstem engellendi ({blockReason}).", null)
                    : With(AiErrorKind.InvalidOutput, "Yanıtta aday bulunamadı.", null);
            }

            var candidate = candidates[0];
            var finish = ReadString(candidate, "finishReason");

            if (finish is not null && BlockedFinishReasons.Contains(finish))
            {
                return With(AiErrorKind.Blocked, $"Yanıt engellendi ({finish}).", finish);
            }

            var text = ExtractText(candidate);

            if (string.Equals(finish, "MAX_TOKENS", StringComparison.OrdinalIgnoreCase))
            {
                return With(AiErrorKind.Truncated, "Yanıt belirteç sınırında kesildi.", finish);
            }

            if (finish is not null
                && !string.Equals(finish, "STOP", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(finish, "FINISH_REASON_UNSPECIFIED", StringComparison.OrdinalIgnoreCase))
            {
                return With(AiErrorKind.InvalidOutput, $"Yanıt beklenmeyen nedenle bitti ({finish}).", finish);
            }

            if (string.IsNullOrWhiteSpace(text))
            {
                return With(AiErrorKind.InvalidOutput, "Yanıt metni boş.", finish);
            }

            try
            {
                using var payload = JsonDocument.Parse(text);
                if (payload.RootElement.ValueKind != JsonValueKind.Object)
                {
                    return With(AiErrorKind.InvalidOutput, "Yanıt bir JSON nesnesi değil.", finish);
                }
            }
            catch (JsonException)
            {
                return With(AiErrorKind.InvalidOutput, "Yanıt metni geçerli bir JSON değil.", finish);
            }

            return new GeminiParsedResponse(true, AiErrorKind.None, text, finish, input, output, thinking, modelVersion, responseId, null, null);
        }
    }

    private static GeminiParsedResponse ParseError(int status, string? body, TimeSpan? retryAfterHeader)
    {
        string? message = null;
        string? statusText = null;
        var perDay = false;
        var apiKeyInvalid = false;
        TimeSpan? retryDelay = null;

        if (!string.IsNullOrWhiteSpace(body))
        {
            try
            {
                using var document = JsonDocument.Parse(body);
                if (document.RootElement.ValueKind == JsonValueKind.Object
                    && document.RootElement.TryGetProperty("error", out var error)
                    && error.ValueKind == JsonValueKind.Object)
                {
                    message = ReadString(error, "message");
                    statusText = ReadString(error, "status");
                    if (error.TryGetProperty("details", out var details) && details.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var detail in details.EnumerateArray())
                        {
                            var type = ReadString(detail, "@type") ?? string.Empty;
                            if (type.EndsWith("RetryInfo", StringComparison.Ordinal))
                            {
                                retryDelay = ParseDuration(ReadString(detail, "retryDelay"));
                            }
                            else if (type.EndsWith("QuotaFailure", StringComparison.Ordinal)
                                && detail.TryGetProperty("violations", out var violations)
                                && violations.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var violation in violations.EnumerateArray())
                                {
                                    var quotaId = ReadString(violation, "quotaId") ?? string.Empty;
                                    if (quotaId.Contains("PerDay", StringComparison.OrdinalIgnoreCase))
                                    {
                                        perDay = true;
                                    }
                                }
                            }
                            else if (type.EndsWith("ErrorInfo", StringComparison.Ordinal)
                                && string.Equals(ReadString(detail, "reason"), "API_KEY_INVALID", StringComparison.OrdinalIgnoreCase))
                            {
                                apiKeyInvalid = true;
                            }
                        }
                    }
                }
            }
            catch (JsonException)
            {
            }
        }

        retryDelay ??= retryAfterHeader;
        var text = Truncate(string.IsNullOrWhiteSpace(message) ? $"Gemini HTTP {status} döndürdü." : message);

        var kind = status switch
        {
            429 => perDay ? AiErrorKind.QuotaExhausted : AiErrorKind.RateLimited,
            401 or 403 => AiErrorKind.AuthFailed,
            408 or 504 => AiErrorKind.Timeout,
            >= 500 => AiErrorKind.Unavailable,
            _ => apiKeyInvalid ? AiErrorKind.AuthFailed : AiErrorKind.InvalidRequest
        };

        if (kind == AiErrorKind.InvalidRequest && string.Equals(statusText, "RESOURCE_EXHAUSTED", StringComparison.OrdinalIgnoreCase))
        {
            kind = AiErrorKind.RateLimited;
        }

        return new GeminiParsedResponse(false, kind, null, null, null, null, null, null, null, text, retryDelay);
    }

    private static string ExtractText(JsonElement candidate)
    {
        if (!candidate.TryGetProperty("content", out var content)
            || content.ValueKind != JsonValueKind.Object
            || !content.TryGetProperty("parts", out var parts)
            || parts.ValueKind != JsonValueKind.Array)
        {
            return string.Empty;
        }

        var builder = new StringBuilder();
        foreach (var part in parts.EnumerateArray())
        {
            if (part.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            if (part.TryGetProperty("thought", out var thought) && thought.ValueKind == JsonValueKind.True)
            {
                continue;
            }

            if (part.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
            {
                builder.Append(text.GetString());
            }
        }

        return builder.ToString();
    }

    private static GeminiParsedResponse Fail(AiErrorKind kind, string message) =>
        new(false, kind, null, null, null, null, null, null, null, message, null);

    private static string? ReadString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static int? ReadInt(JsonElement root, string objectName, string name) =>
        root.TryGetProperty(objectName, out var container)
        && container.ValueKind == JsonValueKind.Object
        && container.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.Number
        && value.TryGetInt32(out var number)
            ? number
            : null;
}
