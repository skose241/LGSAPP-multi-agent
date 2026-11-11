using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Points;

public interface IPointService
{
    Task<int> AwardAsync(int userId, int amount, PointReason reason, int? questionId, int? answerId, int? assignmentId, int? createdByUserId, CancellationToken cancellationToken = default);
}

public sealed class PointService(AppDbContext db, TurkeyTime clock) : IPointService
{
    public async Task<int> AwardAsync(int userId, int amount, PointReason reason, int? questionId, int? answerId, int? assignmentId, int? createdByUserId, CancellationToken cancellationToken = default)
    {
        if (db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException("Puan işlemi yalnızca açık bir veritabanı işlemi içinde yapılabilir.");
        }

        if (amount == 0)
        {
            return 0;
        }

        var now = clock.UtcNow;
        db.PointTransactions.Add(new PointTransaction
        {
            UserId = userId,
            Amount = amount,
            Reason = reason,
            QuestionId = questionId,
            AnswerId = answerId,
            AssignmentId = assignmentId,
            LocalDate = TurkeyTime.ToLocalDate(now),
            CreatedAt = now,
            CreatedByUserId = createdByUserId
        });

        await db.Users
            .Where(u => u.Id == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Points, u => u.Points + amount), cancellationToken);

        return amount;
    }
}
