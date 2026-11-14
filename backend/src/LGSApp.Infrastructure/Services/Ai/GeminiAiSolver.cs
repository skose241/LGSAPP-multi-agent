using System.Text.Json;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Ai;

public sealed class GeminiAiSolver(IGeminiClient client, IOptions<AiOptions> options, AiProviderGate gate) : IAiSolver
{
    public const int TotalBudgetSeconds = 90;
    public const string ImageMimeType = "image/jpeg";

    public bool IsConfigured => options.Value.SolutionConfigured;

    public async Task<AiSolveResult> SolveAsync(int questionId, AiSolveInput input, AiSolveMode mode, CancellationToken cancellationToken)
    {
        if (mode == AiSolveMode.Verified && input.VerifiedOption is not (>= 1 and <= 4))
        {
            throw new ArgumentException("Doğrulanmış modda geçerli bir şık gereklidir.", nameof(input));
        }

        var o = options.Value.Solution;
        if (gate.Check(AiKeyPurpose.Solution) is { } open)
        {
            return AiSolveResult.Failure(open.Kind, SchedulerMessages.ForErrorKind(open.Kind, null), o.Model) with
            {
                RetryAfter = TimeSpan.FromSeconds(open.RetryAfterSeconds)
            };
        }

        var prompt = AiPrompts.SolveUser(input.ToPromptData(mode));
        var parts = new List<GeminiPart> { GeminiPart.Text(prompt) };
        if (input.Image is { Length: > 0 } image)
        {
            parts.Add(GeminiPart.InlineImage(image, ImageMimeType));
        }

        var request = new GeminiRequest(
            o.Model,
            AiPrompts.SolveSystem(),
            parts,
            mode == AiSolveMode.Verified ? AiSchemas.VerifiedSolution() : AiSchemas.BlindSolution(),
            o.MaxOutputTokens,
            string.IsNullOrEmpty(o.ThinkingLevel) ? null : o.ThinkingLevel,
            TimeSpan.FromSeconds(o.TimeoutSeconds),
            o.MaxAttempts,
            TimeSpan.FromSeconds(o.Max429WaitSeconds),
            TimeSpan.FromSeconds(TotalBudgetSeconds));

        var call = await client.GenerateAsync(request, AiKeyPurpose.Solution, cancellationToken);
        if (!call.Succeeded)
        {
            gate.Observe(AiKeyPurpose.Solution, call.ErrorKind);
            var retryAfter = AiProviderGate.Trips(call.ErrorKind) && gate.Check(AiKeyPurpose.Solution) is { } tripped
                ? TimeSpan.FromSeconds(tripped.RetryAfterSeconds)
                : call.RetryAfter;
            return new AiSolveResult(
                call.ErrorKind, call.ErrorMessage, false, 0, null, null, null, o.Model, prompt, null,
                call.InputTokens, call.OutputTokens, call.ThinkingTokens, call.HttpStatus, call.Attempts, call.DurationMs,
                call.ModelVersion, retryAfter, call.FinishReason);
        }

        return Parse(call, o.Model, prompt, mode);
    }

    private static AiSolveResult Parse(GeminiCallResult call, string model, string prompt, AiSolveMode mode)
    {
        AiSolveResult Invalid(string message) =>
            new(AiErrorKind.InvalidOutput, message, false, 0, null, null, null, model, prompt, call.Json,
                call.InputTokens, call.OutputTokens, call.ThinkingTokens, call.HttpStatus, call.Attempts, call.DurationMs,
                call.ModelVersion, null, call.FinishReason);

        try
        {
            using var document = JsonDocument.Parse(call.Json ?? string.Empty);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("readable", out var readableNode) || readableNode.ValueKind is not (JsonValueKind.True or JsonValueKind.False)
                || !root.TryGetProperty("answer", out var answerNode) || answerNode.ValueKind != JsonValueKind.String
                || !root.TryGetProperty("confidence", out var confidenceNode) || confidenceNode.ValueKind != JsonValueKind.String
                || !root.TryGetProperty("solution", out var solutionNode) || solutionNode.ValueKind != JsonValueKind.String)
            {
                return Invalid("Yapay zekâ yanıtı beklenen şemaya uymuyor.");
            }

            var answer = answerNode.GetString() switch
            {
                "A" => 1,
                "B" => 2,
                "C" => 3,
                "D" => 4,
                "NONE" => 0,
                _ => -1
            };
            var confidence = confidenceNode.GetString();
            if (answer < 0 || !AiSchemas.Confidences.Contains(confidence))
            {
                return Invalid("Yapay zekâ yanıtında geçersiz şık veya güven değeri var.");
            }

            bool? agrees = null;
            if (mode == AiSolveMode.Verified)
            {
                if (!root.TryGetProperty("agreesWithKey", out var agreesNode) || agreesNode.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                {
                    return Invalid("Yapay zekâ yanıtında agreesWithKey alanı yok.");
                }

                agrees = agreesNode.GetBoolean();
            }

            return new AiSolveResult(
                AiErrorKind.None, null, readableNode.GetBoolean(), answer, confidence, solutionNode.GetString(), agrees,
                model, prompt, call.Json, call.InputTokens, call.OutputTokens, call.ThinkingTokens, call.HttpStatus,
                call.Attempts, call.DurationMs, call.ModelVersion, null, call.FinishReason);
        }
        catch (JsonException)
        {
            return Invalid("Yapay zekâ yanıtı geçerli JSON değil.");
        }
    }
}
