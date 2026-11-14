using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Settings;
using LGSApp.Infrastructure.Services.Solutions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Ai;

public enum AiSolutionStatus
{
    Created = 1,
    Existing = 2,
    UnderReview = 3
}

public sealed record AiSolutionQuotaView(int DailyLimit, int UsedToday, int RemainingToday);

public sealed record AiSolutionResponse(AiSolutionStatus Status, SolutionView? Solution, string Message, AiSolutionQuotaView? Quota);

public sealed record AiSolutionStateInfo(string State, bool CanRequest);

public static class AiSolutionStates
{
    public const string None = "none";
    public const string Available = "available";
    public const string UnderReview = "underReview";
    public const string Removed = "removed";
    public const string Unavailable = "unavailable";
    public const string Unreadable = "unreadable";
}

public interface IAiSolutionService
{
    Task<ServiceResult<AiSolutionResponse>> RequestAsync(Actor actor, int questionId, CancellationToken cancellationToken = default);
    Task<AiSolutionStateInfo> GetStateAsync(Actor actor, int questionId, bool canSeeDiscussion, CancellationToken cancellationToken = default);
    Task<ServiceResult<AiQuotaStatusView>> GetQuotaAsync(Actor actor, CancellationToken cancellationToken = default);
}

public sealed class AiSolutionService(
    AppDbContext db,
    IQuestionAccessService access,
    ISettingsService settings,
    IOptions<AiOptions> options,
    IAiQuotaService quota,
    AiSolutionCoordinator coordinator,
    UserLookupService users,
    TurkeyTime clock) : IAiSolutionService
{
    public async Task<ServiceResult<AiSolutionResponse>> RequestAsync(Actor actor, int questionId, CancellationToken cancellationToken = default)
    {
        var allowed = await access.RequireDiscussionAsync(questionId, actor, AiMessages.MustAnswerFirst, cancellationToken);
        if (!allowed.Succeeded)
        {
            return ServiceResult<AiSolutionResponse>.From(allowed);
        }

        var existing = await TryExistingAsync(actor, questionId, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        if (await IsClosedAsync(actor, cancellationToken))
        {
            return Fail.Unavailable(AiMessages.SolutionUnavailable);
        }

        if (await UnreadableCachedAsync(questionId, cancellationToken))
        {
            return Fail.Unprocessable(AiMessages.Unreadable);
        }

        var running = coordinator.TryJoin(questionId);
        if (running is not null)
        {
            return await CompleteAsync(actor, questionId, await running.WaitAsync(cancellationToken), false, cancellationToken);
        }

        var reservation = await quota.ReserveAsync(actor, questionId, options.Value.Solution.Model, cancellationToken);
        switch (reservation.Status)
        {
            case AiReservationStatus.PersonalLimit:
                return Fail.TooManyRequests(AiMessages.PersonalLimit, reservation.RetryAfterSeconds);
            case AiReservationStatus.GlobalLimit:
                return Fail.TooManyRequests(AiMessages.GlobalLimit, reservation.RetryAfterSeconds);
            case AiReservationStatus.Busy:
                return Fail.Unavailable(AiMessages.ProviderFailure, reservation.RetryAfterSeconds);
        }

        var logId = reservation.LogId;
        var (task, started) = coordinator.GetOrStart(
            questionId,
            (services, token) => services.GetRequiredService<IAiSolutionProducer>().ProduceAsync(new AiProductionRequest(questionId, logId), token));

        if (!started)
        {
            await quota.DiscardAsync(logId, CancellationToken.None);
        }

        return await CompleteAsync(actor, questionId, await task.WaitAsync(cancellationToken), started, cancellationToken);
    }

    public async Task<AiSolutionStateInfo> GetStateAsync(Actor actor, int questionId, bool canSeeDiscussion, CancellationToken cancellationToken = default)
    {
        if (!canSeeDiscussion)
        {
            return AiAvailability.ResolveState(false, new AiStateFacts(false, false, false, false, false));
        }

        var solution = await db.Solutions.AsNoTracking()
            .Where(s => s.QuestionId == questionId && s.Type == SolutionType.Ai && !s.IsDeleted)
            .Select(s => new { s.IsHidden })
            .FirstOrDefaultAsync(cancellationToken);
        if (solution is not null)
        {
            var disputed = solution.IsHidden
                && await db.Questions.AsNoTracking().AnyAsync(q => q.Id == questionId && q.IsAnswerDisputed, cancellationToken);
            return AiAvailability.ResolveState(true, new AiStateFacts(true, solution.IsHidden, disputed, false, false));
        }

        var closed = await IsClosedAsync(actor, cancellationToken);
        var unreadable = !closed && await UnreadableCachedAsync(questionId, cancellationToken);
        return AiAvailability.ResolveState(true, new AiStateFacts(false, false, false, closed, unreadable));
    }

    public async Task<ServiceResult<AiQuotaStatusView>> GetQuotaAsync(Actor actor, CancellationToken cancellationToken = default) =>
        ServiceResult<AiQuotaStatusView>.Ok(await quota.GetStatusAsync(actor, cancellationToken));

    private async Task<bool> IsClosedAsync(Actor actor, CancellationToken cancellationToken)
    {
        var enabled = options.Value.SolutionConfigured && await settings.GetIntAsync(SettingKeys.AiCozumAktifMi, cancellationToken) == 1;
        var globalLimit = await settings.GetIntAsync(SettingKeys.AiGunlukCozumGlobalLimit, cancellationToken);
        var personalLimit = actor.IsModerator ? 0 : await settings.GetIntAsync(SettingKeys.AiGunlukCozumLimit, cancellationToken);
        return AiAvailability.IsClosed(enabled, actor.IsModerator, personalLimit, globalLimit);
    }

    private async Task<bool> UnreadableCachedAsync(int questionId, CancellationToken cancellationToken)
    {
        var hours = await settings.GetIntAsync(SettingKeys.AiOkunamadiBeklemeSaat, cancellationToken);
        if (hours <= 0)
        {
            return false;
        }

        var since = clock.UtcNow.AddHours(-hours);
        return await db.AiLogs.AsNoTracking().AnyAsync(
            l => l.QuestionId == questionId
                && l.Operation == AiOperation.SolutionInvalid
                && l.ErrorKind == AiErrorKind.Unreadable
                && l.CreatedAt >= since,
            cancellationToken);
    }

    private async Task<ServiceResult<AiSolutionResponse>?> TryExistingAsync(Actor actor, int questionId, CancellationToken cancellationToken)
    {
        var solution = await db.Solutions.AsNoTracking()
            .Where(s => s.QuestionId == questionId && s.Type == SolutionType.Ai && !s.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);
        if (solution is null)
        {
            return null;
        }

        if (!solution.IsHidden)
        {
            return ServiceResult<AiSolutionResponse>.Ok(
                new AiSolutionResponse(AiSolutionStatus.Existing, await ViewAsync(actor, solution, cancellationToken), AiMessages.Existing, await QuotaViewAsync(actor, cancellationToken)));
        }

        var disputed = await db.Questions.AsNoTracking().AnyAsync(q => q.Id == questionId && q.IsAnswerDisputed, cancellationToken);
        if (!disputed)
        {
            return Fail.Conflict(AiMessages.SolutionRemoved);
        }

        return ServiceResult<AiSolutionResponse>.Ok(
            new AiSolutionResponse(AiSolutionStatus.UnderReview, null, AiMessages.UnderReview, await QuotaViewAsync(actor, cancellationToken)));
    }

    private async Task<ServiceResult<AiSolutionResponse>> CompleteAsync(Actor actor, int questionId, AiProduction production, bool isStarter, CancellationToken cancellationToken)
    {
        switch (production.Kind)
        {
            case AiProductionKind.Created when production.SolutionId is int id:
            {
                var solution = await db.Solutions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
                if (solution is null)
                {
                    return Fail.Unavailable(AiMessages.ProviderFailure, AiSolutionProducer.DefaultRetryAfterSeconds);
                }

                return ServiceResult<AiSolutionResponse>.Ok(new AiSolutionResponse(
                    isStarter ? AiSolutionStatus.Created : AiSolutionStatus.Existing,
                    await ViewAsync(actor, solution, cancellationToken),
                    isStarter ? AiMessages.Created : AiMessages.Existing,
                    await QuotaViewAsync(actor, cancellationToken)));
            }
            case AiProductionKind.UnderReview:
                return ServiceResult<AiSolutionResponse>.Ok(
                    new AiSolutionResponse(AiSolutionStatus.UnderReview, null, AiMessages.UnderReview, await QuotaViewAsync(actor, cancellationToken)));
            case AiProductionKind.Duplicate:
                return await TryExistingAsync(actor, questionId, cancellationToken)
                    ?? Fail.Unavailable(AiMessages.ProviderFailure, AiSolutionProducer.DefaultRetryAfterSeconds);
            case AiProductionKind.Unreadable:
                return Fail.Unprocessable(AiMessages.Unreadable);
            case AiProductionKind.Unreliable:
                return Fail.Unprocessable(AiMessages.Unreliable);
            default:
                return Fail.Unavailable(AiMessages.ProviderFailure, production.RetryAfterSeconds ?? AiSolutionProducer.DefaultRetryAfterSeconds);
        }
    }

    private async Task<SolutionView> ViewAsync(Actor actor, Solution solution, CancellationToken cancellationToken)
    {
        var people = await users.GetAsync([solution.AuthorUserId], actor.IsModerator, cancellationToken);
        return SolutionService.ToView(solution, actor, people, 0, null);
    }

    private async Task<AiSolutionQuotaView?> QuotaViewAsync(Actor actor, CancellationToken cancellationToken)
    {
        var summary = await quota.GetSummaryAsync(actor, cancellationToken);
        return summary is { DailyLimit: { } limit, RemainingToday: { } remaining }
            ? new AiSolutionQuotaView(limit, summary.UsedToday, remaining)
            : null;
    }
}
