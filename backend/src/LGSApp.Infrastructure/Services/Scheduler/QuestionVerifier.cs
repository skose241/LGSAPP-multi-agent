using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Ai;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Scheduler;

public sealed record QuestionVerification(
    bool Passed,
    string? Error,
    AiErrorKind ErrorKind,
    AiLogStatus Status,
    string? Model,
    string? Prompt,
    string? RawOutput,
    int? InputTokens,
    int? OutputTokens,
    int? ThinkingTokens,
    int? HttpStatus,
    int AttemptCount,
    int DurationMs,
    string? ModelVersion,
    decimal? CostUsd,
    string? RawError = null);

public interface IQuestionVerifier
{
    Task<bool> IsEnabledAsync(CancellationToken cancellationToken);

    Task<QuestionVerification> VerifyAsync(QuestionGenerationRequest request, ValidatedQuestion question, CancellationToken cancellationToken);
}

public sealed class QuestionVerifier(
    IAiSolver solver,
    ISettingsService settings,
    IOptions<AiOptions> options,
    AiCostCalculator cost,
    AiProviderGate gate) : IQuestionVerifier
{
    public async Task<bool> IsEnabledAsync(CancellationToken cancellationToken)
    {
        var o = options.Value;
        if (o.Provider != AiProvider.Gemini || !o.Question.VerifyEnabled)
        {
            return false;
        }

        return await settings.GetIntAsync(SettingKeys.AiSoruDogrulamaAktifMi, cancellationToken) == 1;
    }

    public async Task<QuestionVerification> VerifyAsync(QuestionGenerationRequest request, ValidatedQuestion question, CancellationToken cancellationToken)
    {
        var model = options.Value.Solution.Model;
        if (!solver.IsConfigured)
        {
            return Failed(SchedulerMessages.VerificationNotConfigured, AiErrorKind.NotConfigured, model, null, null, null, null, null, null, 0, 0, null, null);
        }

        if (gate.Check(AiKeyPurpose.Solution) is { } open)
        {
            return Failed(SchedulerMessages.ForVerificationFailure(open.Kind), open.Kind, model, null, null, null, null, null, null, 0, 0, null, null);
        }

        var input = new AiSolveInput(request.LessonName, request.TopicName, question.Text, question.OptionA, question.OptionB, question.OptionC, question.OptionD, null, null);
        var result = await solver.SolveAsync(0, input, AiSolveMode.Blind, cancellationToken);
        var price = cost.Calculate(result.Model ?? model, result.InputTokens, result.OutputTokens, result.ThinkingTokens);

        if (result.ErrorKind.IsProviderFailure())
        {
            return Failed(
                SchedulerMessages.ForVerificationFailure(result.ErrorKind), result.ErrorKind, result.Model ?? model, result.Prompt, result.RawOutput,
                result.InputTokens, result.OutputTokens, result.ThinkingTokens, result.HttpStatus, result.Attempts, result.DurationMs, result.ModelVersion, price,
                result.ErrorMessage);
        }

        var classification = AiSolveClassifier.Classify(result, AiSolveMode.Blind, question.CorrectOption);
        string? error = null;
        var kind = classification.ErrorKind;
        switch (classification.Outcome)
        {
            case AiSolveOutcome.Mismatch:
                error = SchedulerMessages.VerificationMismatch;
                kind = AiErrorKind.InvalidOutput;
                break;
            case AiSolveOutcome.Unreadable:
                error = SchedulerMessages.VerificationUnreadable;
                break;
            case AiSolveOutcome.Unreliable:
                error = result.Succeeded && result.Answer is >= 1 and <= 4 && result.Answer != question.CorrectOption
                    ? SchedulerMessages.VerificationMismatch
                    : SchedulerMessages.VerificationUnreliable;
                break;
            case AiSolveOutcome.Accepted when result.Confidence == "low":
                error = SchedulerMessages.VerificationLowConfidence;
                kind = AiErrorKind.InvalidOutput;
                break;
        }

        var passed = error is null;
        var status = passed ? AiLogStatus.Succeeded : result.Succeeded ? AiLogStatus.Rejected : AiLogStatus.Failed;
        return new QuestionVerification(
            passed, error, passed ? AiErrorKind.None : kind, status, result.Model ?? model, result.Prompt, result.RawOutput,
            result.InputTokens, result.OutputTokens, result.ThinkingTokens, result.HttpStatus, result.Attempts, result.DurationMs, result.ModelVersion, price);
    }

    private static QuestionVerification Failed(
        string error, AiErrorKind kind, string? model, string? prompt, string? raw, int? input, int? output, int? thinking,
        int? http, int attempts, int duration, string? version, decimal? price, string? rawError = null) =>
        new(false, error, kind, AiLogStatus.Failed, model, prompt, raw, input, output, thinking, http, attempts, duration, version, price, rawError);
}
