using System.Text.Json;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Scheduler;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Ai;

public sealed class GeminiQuestionGenerator(
    IGeminiClient client,
    IOptions<AiOptions> options,
    AiCostCalculator cost,
    AiProviderGate gate,
    TimeProvider timeProvider,
    ILogger<GeminiQuestionGenerator> logger) : IQuestionGenerator
{
    public static readonly TimeSpan RateLimitFallbackWait = TimeSpan.FromSeconds(35);
    public static readonly TimeSpan MinimumBudget = TimeSpan.FromSeconds(5);

    public bool IsConfigured => options.Value.QuestionConfigured;

    public async Task<QuestionGenerationResult> GenerateAsync(QuestionGenerationRequest request, CancellationToken cancellationToken)
    {
        var o = options.Value.Question;
        var target = request.TargetOption is >= 1 and <= 4 ? request.TargetOption : (request.Slot + request.LessonId) % 4 + 1;
        var prompt = AiPrompts.QuestionUser(new AiQuestionPromptData(request.LessonName, request.TopicName, target, request.RecentQuestions));

        if (gate.Check(AiKeyPurpose.Question) is { } open)
        {
            return QuestionGenerationResult.Failure(
                SchedulerMessages.ForErrorKind(open.Kind, null), false, o.Model, prompt, errorKind: open.Kind, attemptCount: 0);
        }

        var budget = TimeSpan.FromSeconds(o.SlotBudgetSeconds);
        if (request.DeadlineUtc is { } deadline)
        {
            var remaining = new DateTimeOffset(DateTime.SpecifyKind(deadline, DateTimeKind.Utc)) - timeProvider.GetUtcNow();
            if (remaining < budget)
            {
                budget = remaining;
            }
        }

        if (budget < MinimumBudget)
        {
            return QuestionGenerationResult.Failure(
                "Çalıştırma süresi dolduğu için soru üretilemedi.", true, o.Model, prompt, errorKind: AiErrorKind.Timeout, attemptCount: 0);
        }

        var timeout = TimeSpan.FromSeconds(o.TimeoutSeconds);
        if (timeout > budget)
        {
            timeout = budget;
        }

        var call = await client.GenerateAsync(
            new GeminiRequest(
                o.Model,
                AiPrompts.QuestionSystem(request.LessonName),
                [GeminiPart.Text(prompt)],
                AiSchemas.Question(),
                o.MaxOutputTokens,
                string.IsNullOrEmpty(o.ThinkingLevel) ? null : o.ThinkingLevel,
                timeout,
                o.MaxAttempts,
                TimeSpan.FromSeconds(o.Max429WaitSeconds),
                budget,
                RateLimitFallbackWait),
            AiKeyPurpose.Question,
            cancellationToken);

        var price = cost.Calculate(o.Model, call.InputTokens, call.OutputTokens, call.ThinkingTokens);

        if (!call.Succeeded)
        {
            gate.Observe(AiKeyPurpose.Question, call.ErrorKind);
            return QuestionGenerationResult.Failure(
                SchedulerMessages.ForErrorKind(call.ErrorKind, "Yapay zekâ soru üretemedi."),
                IsTransient(call.ErrorKind),
                o.Model,
                prompt,
                null,
                call.DurationMs,
                call.ErrorKind,
                call.InputTokens,
                call.OutputTokens,
                call.ThinkingTokens,
                price,
                call.Attempts,
                call.ModelVersion,
                call.HttpStatus,
                call.ErrorMessage);
        }

        QuestionGenerationResult Invalid(string message) =>
            QuestionGenerationResult.Failure(
                message, true, o.Model, prompt, call.Json, call.DurationMs, AiErrorKind.InvalidOutput,
                call.InputTokens, call.OutputTokens, call.ThinkingTokens, price, call.Attempts, call.ModelVersion, call.HttpStatus);

        try
        {
            using var document = JsonDocument.Parse(call.Json ?? string.Empty);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return Invalid("Yapay zekâ yanıtı beklenen şemaya uymuyor.");
            }

            string? Read(string name) =>
                root.TryGetProperty(name, out var node) && node.ValueKind == JsonValueKind.String ? node.GetString() : null;

            var letter = Read("correctOption");
            var correct = letter switch { "A" => 1, "B" => 2, "C" => 3, "D" => 4, _ => 0 };
            var text = Read("question");
            var a = Read("optionA");
            var b = Read("optionB");
            var c = Read("optionC");
            var d = Read("optionD");
            var explanation = Read("explanation");
            if (correct == 0 || text is null || a is null || b is null || c is null || d is null || explanation is null)
            {
                return Invalid("Yapay zekâ yanıtı beklenen şemaya uymuyor.");
            }

            if (correct != target)
            {
                logger.LogWarning(
                    "Model hedef şıktan farklı doğru cevap döndürdü. Hedef {Target}, dönen {Returned}, ders {LessonId}, slot {Slot}",
                    AiPrompts.Letter(target), letter, request.LessonId, request.Slot);
            }

            return new QuestionGenerationResult(
                true, text, a, b, c, d, correct, explanation, o.Model, prompt, call.Json,
                call.InputTokens, call.OutputTokens, call.DurationMs, null, false, AiErrorKind.None,
                call.ThinkingTokens, price, call.Attempts, call.ModelVersion, call.HttpStatus, Read("topic"));
        }
        catch (JsonException)
        {
            return Invalid("Yapay zekâ yanıtı geçerli JSON değil.");
        }
    }

    public static bool IsTransient(AiErrorKind kind) =>
        kind is AiErrorKind.RateLimited or AiErrorKind.Unavailable or AiErrorKind.Timeout or AiErrorKind.Truncated or AiErrorKind.InvalidOutput;
}
