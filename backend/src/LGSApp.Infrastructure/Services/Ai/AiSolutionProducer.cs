using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Ai;

public sealed record AiProductionRequest(int QuestionId, long LogId);

public interface IAiSolutionProducer
{
    Task<AiProduction> ProduceAsync(AiProductionRequest request, CancellationToken cancellationToken);
}

public sealed class AiSolutionProducer(
    AppDbContext db,
    IBlobStore blobs,
    IImageProcessor images,
    IAiSolver solver,
    IAiSolutionWriter writer,
    IAiCallLogger callLogger,
    IAiQuotaService quota,
    AiCostCalculator costs,
    IOptions<AiOptions> aiOptions,
    IOptions<UploadOptions> uploadOptions,
    TurkeyTime clock,
    ILogger<AiSolutionProducer> logger) : IAiSolutionProducer
{
    public const int DefaultRetryAfterSeconds = 30;

    public async Task<AiProduction> ProduceAsync(AiProductionRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return await ProduceCoreAsync(request, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            await quota.ReleaseAsync(request.LogId, AiErrorKind.Canceled, "Uygulama kapanırken iptal edildi.", CancellationToken.None);
            return new AiProduction(AiProductionKind.ProviderFailure, RetryAfterSeconds: DefaultRetryAfterSeconds);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Yapay zekâ çözümü üretilemedi. Soru: {QuestionId}", request.QuestionId);
            await quota.ReleaseAsync(request.LogId, AiErrorKind.Unavailable, ex.GetType().Name, CancellationToken.None);
            return new AiProduction(AiProductionKind.ProviderFailure, RetryAfterSeconds: DefaultRetryAfterSeconds);
        }
    }

    private async Task<AiProduction> ProduceCoreAsync(AiProductionRequest request, CancellationToken cancellationToken)
    {
        var questionId = request.QuestionId;
        var q = await db.Questions.AsNoTracking()
            .Where(x => x.Id == questionId)
            .Select(x => new
            {
                x.Text,
                x.OptionA,
                x.OptionB,
                x.OptionC,
                x.OptionD,
                x.CorrectOption,
                x.ImageFileId,
                x.AnswerKeyReviewedAt,
                x.TopicId,
                LessonName = x.Lesson.Name
            })
            .FirstOrDefaultAsync(cancellationToken);
        if (q is null)
        {
            await quota.ReleaseAsync(request.LogId, AiErrorKind.Unavailable, "Soru bulunamadı.", CancellationToken.None);
            return new AiProduction(AiProductionKind.ProviderFailure, RetryAfterSeconds: DefaultRetryAfterSeconds);
        }

        var aiUserId = await db.UserRoles.AsNoTracking()
            .Where(ur => ur.RoleId == Roles.AiId)
            .Select(ur => (int?)ur.UserId)
            .FirstOrDefaultAsync(cancellationToken);
        if (aiUserId is null)
        {
            await quota.ReleaseAsync(request.LogId, AiErrorKind.Unavailable, "Yapay zekâ sistem hesabı bulunamadı.", CancellationToken.None);
            return new AiProduction(AiProductionKind.ProviderFailure, RetryAfterSeconds: DefaultRetryAfterSeconds);
        }

        string? topicName = null;
        if (q.TopicId is int topicId)
        {
            topicName = await db.Topics.AsNoTracking().Where(t => t.Id == topicId).Select(t => t.Name).FirstOrDefaultAsync(cancellationToken);
        }

        byte[]? image = null;
        string? imageHash = null;
        if (q.ImageFileId is int imageId)
        {
            var blobName = await db.StoredFiles.AsNoTracking()
                .Where(f => f.Id == imageId && f.Status == FileStatus.Ready)
                .Select(f => f.BlobName)
                .FirstOrDefaultAsync(cancellationToken);
            if (blobName is null)
            {
                await quota.ReleaseAsync(request.LogId, AiErrorKind.Unavailable, "Soru görseli bulunamadı.", CancellationToken.None);
                return new AiProduction(AiProductionKind.ProviderFailure, RetryAfterSeconds: DefaultRetryAfterSeconds);
            }

            var solution = aiOptions.Value.Solution;
            var original = await blobs.DownloadAsync(blobName, uploadOptions.Value.MaxBytes, cancellationToken);
            image = await Task.Run(() => images.ResizeForAi(original, solution.ImageMaxEdge, solution.ImageJpegQuality), cancellationToken);
            imageHash = AiCallLogger.ComputeSha256(image);
        }

        var mode = q.AnswerKeyReviewedAt is null ? AiSolveMode.Blind : AiSolveMode.Verified;
        var input = new AiSolveInput(
            q.LessonName, topicName, q.Text, q.OptionA, q.OptionB, q.OptionC, q.OptionD, image,
            mode == AiSolveMode.Verified ? q.CorrectOption : null);

        var result = await solver.SolveAsync(questionId, input, mode, cancellationToken);
        var logInput = AiCallLogger.BuildInput(result.Prompt ?? string.Empty, q.ImageFileId, imageHash);
        var cost = costs.Calculate(result.Model, result.InputTokens, result.OutputTokens, result.ThinkingTokens);

        if (result.ErrorKind.IsProviderFailure())
        {
            logger.Log(
                result.ErrorKind is AiErrorKind.AuthFailed or AiErrorKind.InvalidRequest or AiErrorKind.NotConfigured ? LogLevel.Error : LogLevel.Warning,
                "Yapay zekâ çözüm çağrısı başarısız. Soru: {QuestionId}, Tür: {Kind}", questionId, result.ErrorKind);
            await callLogger.CompleteAsync(
                request.LogId,
                new AiLogCompletion(
                    AiLogStatus.Failed, AiOperation.Solution, result.ErrorKind, result.ErrorMessage, result.HttpStatus, result.Model,
                    result.ModelVersion, logInput, null, result.InputTokens, result.OutputTokens, result.ThinkingTokens,
                    result.DurationMs, Math.Max(1, result.Attempts), cost, false, null, q.ImageFileId),
                clock.UtcNow,
                CancellationToken.None);
            var retry = result.ErrorKind == AiErrorKind.QuotaExhausted
                ? GeminiQuotaReset.SecondsUntilPacificMidnight(clock.UtcNow)
                : result.RetryAfter is { } span ? Math.Max(1, (int)Math.Ceiling(span.TotalSeconds)) : DefaultRetryAfterSeconds;
            return new AiProduction(AiProductionKind.ProviderFailure, RetryAfterSeconds: retry);
        }

        var outcome = await writer.WriteAsync(
            new AiWriteRequest(questionId, request.LogId, aiUserId.Value, result, mode, q.CorrectOption, logInput, q.ImageFileId, cost),
            cancellationToken);

        return outcome.Kind switch
        {
            AiWriteKind.Created => new AiProduction(AiProductionKind.Created, outcome.SolutionId),
            AiWriteKind.UnderReview => new AiProduction(AiProductionKind.UnderReview, outcome.SolutionId),
            AiWriteKind.Unreadable => new AiProduction(AiProductionKind.Unreadable),
            AiWriteKind.Unreliable => new AiProduction(AiProductionKind.Unreliable),
            AiWriteKind.Duplicate => new AiProduction(AiProductionKind.Duplicate, outcome.SolutionId),
            _ => new AiProduction(AiProductionKind.ProviderFailure, RetryAfterSeconds: DefaultRetryAfterSeconds)
        };
    }
}
