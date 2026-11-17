using System.Data.Common;
using System.Runtime.CompilerServices;
using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace LGSApp.Infrastructure.Services.Leaderboard;

public sealed class LeaderboardInvalidationInterceptor(ILeaderboardCache cache) : SaveChangesInterceptor, IDbTransactionInterceptor
{
    private sealed class State
    {
        public bool Saving;
        public bool Pending;
    }

    private readonly ConditionalWeakTable<DbContext, State> states = new();

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        MarkSaving(eventData.Context);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        MarkSaving(eventData.Context);
        return ValueTask.FromResult(result);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        Saved(eventData.Context);
        return result;
    }

    public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        Saved(eventData.Context);
        return ValueTask.FromResult(result);
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData) => ClearSaving(eventData.Context);

    public override Task SaveChangesFailedAsync(DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        ClearSaving(eventData.Context);
        return Task.CompletedTask;
    }

    public void TransactionCommitted(DbTransaction transaction, TransactionEndEventData eventData) => Committed(eventData.Context);

    public Task TransactionCommittedAsync(DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        Committed(eventData.Context);
        return Task.CompletedTask;
    }

    public void TransactionRolledBack(DbTransaction transaction, TransactionEndEventData eventData) => Discard(eventData.Context);

    public Task TransactionRolledBackAsync(DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        Discard(eventData.Context);
        return Task.CompletedTask;
    }

    public void TransactionFailed(DbTransaction transaction, TransactionErrorEventData eventData) => Discard(eventData.Context);

    public Task TransactionFailedAsync(DbTransaction transaction, TransactionErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        Discard(eventData.Context);
        return Task.CompletedTask;
    }

    private void MarkSaving(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        var touches = context.ChangeTracker.Entries<PointTransaction>()
            .Any(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted);
        states.GetOrCreateValue(context).Saving = touches;
    }

    private void Saved(DbContext? context)
    {
        if (context is null || !states.TryGetValue(context, out var state) || !state.Saving)
        {
            return;
        }

        state.Saving = false;
        if (context.Database.CurrentTransaction is null)
        {
            cache.Invalidate();
        }
        else
        {
            state.Pending = true;
        }
    }

    private void ClearSaving(DbContext? context)
    {
        if (context is not null && states.TryGetValue(context, out var state))
        {
            state.Saving = false;
        }
    }

    private void Committed(DbContext? context)
    {
        if (context is null || !states.TryGetValue(context, out var state))
        {
            return;
        }

        if (state.Pending)
        {
            state.Pending = false;
            cache.Invalidate();
        }
    }

    private void Discard(DbContext? context)
    {
        if (context is not null && states.TryGetValue(context, out var state))
        {
            state.Pending = false;
        }
    }
}
