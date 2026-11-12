using System.Globalization;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Notifications;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Assignments;

public interface IAssignmentLifecycleService
{
    Task<int> ActivateDueAsync(DateOnly today, CancellationToken cancellationToken = default);
    Task<int> CloseDueAsync(DateOnly today, CancellationToken cancellationToken = default);
}

public sealed class AssignmentLifecycleService(
    AppDbContext db,
    IAssignmentNotifier assignmentNotifier,
    INotificationService notifications,
    TurkeyTime clock) : IAssignmentLifecycleService
{
    public Task<int> ActivateDueAsync(DateOnly today, CancellationToken cancellationToken = default) =>
        db.ExecuteInTransactionAsync(async token =>
        {
            var status = (byte)AssignmentStatus.Scheduled;
            var due = await db.Assignments
                .FromSqlInterpolated($"SELECT * FROM [Assignments] WITH (UPDLOCK, ROWLOCK) WHERE [IsDeleted] = 0 AND [Status] = {status} AND [StartDate] <= {today} AND [EndDate] >= {today}")
                .ToListAsync(token);

            if (due.Count == 0)
            {
                return 0;
            }

            var now = clock.UtcNow;
            foreach (var assignment in due)
            {
                assignment.Status = AssignmentStatus.Published;
                assignment.PublishedAt = now;
                assignment.UpdatedAt = now;
            }

            await db.SaveChangesAsync(token);

            foreach (var assignment in due)
            {
                await assignmentNotifier.NotifyStudentsAsync(
                    assignment.Id,
                    NotificationType.AssignmentOpened,
                    $"Yeni ödev açıldı: {assignment.Title}",
                    token);
            }

            return due.Count;
        }, cancellationToken);

    public Task<int> CloseDueAsync(DateOnly today, CancellationToken cancellationToken = default) =>
        db.ExecuteInTransactionAsync(async token =>
        {
            var scheduled = (byte)AssignmentStatus.Scheduled;
            var published = (byte)AssignmentStatus.Published;
            var due = await db.Assignments
                .FromSqlInterpolated($"SELECT * FROM [Assignments] WITH (UPDLOCK, ROWLOCK) WHERE [IsDeleted] = 0 AND [Status] IN ({scheduled}, {published}) AND [EndDate] < {today}")
                .ToListAsync(token);

            if (due.Count == 0)
            {
                return 0;
            }

            var now = clock.UtcNow;
            foreach (var assignment in due)
            {
                assignment.Status = AssignmentStatus.Closed;
                assignment.ClosedAt = now;
                assignment.UpdatedAt = now;
            }

            var ids = due.Select(a => a.Id).ToList();
            var stats = await db.Answers.AsNoTracking()
                .Where(a => a.AssignmentId != null && ids.Contains(a.AssignmentId.Value))
                .GroupBy(a => a.AssignmentId!.Value)
                .Select(g => new
                {
                    AssignmentId = g.Key,
                    Participants = g.Select(x => x.UserId).Distinct().Count(),
                    Total = g.Count(),
                    Correct = g.Count(x => x.IsCorrect)
                })
                .ToDictionaryAsync(x => x.AssignmentId, token);

            foreach (var assignment in due)
            {
                var summary = stats.GetValueOrDefault(assignment.Id);
                var participants = summary?.Participants ?? 0;
                var rate = summary is { Total: > 0 } ? (int)Math.Round(100.0 * summary.Correct / summary.Total) : 0;
                await notifications.NotifyAsync(
                    new NotificationDraft(
                        assignment.TeacherUserId,
                        NotificationType.AssignmentClosed,
                        $"\"{assignment.Title}\" ödevi kapandı. {participants.ToString(CultureInfo.InvariantCulture)} öğrenci katıldı, doğru oranı %{rate.ToString(CultureInfo.InvariantCulture)}.",
                        AssignmentId: assignment.Id),
                    false,
                    token);
            }

            await db.SaveChangesAsync(token);

            foreach (var assignment in due.Where(a => a.PublishedAt is not null))
            {
                await assignmentNotifier.NotifyStudentsAsync(
                    assignment.Id,
                    NotificationType.AssignmentClosed,
                    $"\"{assignment.Title}\" ödevi sona erdi. Sonuçlar ve tartışma açıldı.",
                    token);
            }

            return due.Count;
        }, cancellationToken);
}
