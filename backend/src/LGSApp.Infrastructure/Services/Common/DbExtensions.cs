using LGSApp.Infrastructure.Persistence;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Common;

public static class DbExtensions
{
    public static Task<T> ExecuteInTransactionAsync<T>(this AppDbContext db, Func<CancellationToken, Task<T>> action, CancellationToken cancellationToken)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        return strategy.ExecuteAsync(async token =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(token);
            var result = await action(token);
            if (result is IServiceResult { Succeeded: false })
            {
                await transaction.RollbackAsync(token);
            }
            else
            {
                await transaction.CommitAsync(token);
            }

            return result;
        }, cancellationToken);
    }

    public static bool IsUniqueViolation(this DbUpdateException exception) =>
        exception.InnerException is SqlException { Number: 2601 or 2627 };
}
