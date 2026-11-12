using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Notifications;

public sealed record NotificationItemView(
    long Id,
    NotificationType Type,
    string Message,
    int? QuestionId,
    int? AssignmentId,
    int? CommentId,
    bool IsRead,
    DateTime CreatedAt);

public sealed record NotificationListView(int Page, int PageSize, int TotalCount, IReadOnlyList<NotificationItemView> Items);

public sealed record UnreadCountView(int Count);

public interface INotificationInboxService
{
    Task<ServiceResult<NotificationListView>> ListAsync(Actor actor, bool unreadOnly, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<UnreadCountView> UnreadCountAsync(Actor actor, CancellationToken cancellationToken = default);
    Task<ServiceResult> MarkReadAsync(Actor actor, long notificationId, CancellationToken cancellationToken = default);
    Task<ServiceResult> MarkAllReadAsync(Actor actor, CancellationToken cancellationToken = default);
}

public sealed class NotificationInboxService(AppDbContext db, TurkeyTime clock) : INotificationInboxService
{
    private const int MaxPageSize = 50;

    public async Task<ServiceResult<NotificationListView>> ListAsync(Actor actor, bool unreadOnly, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        if (page < 1)
        {
            return Fail.Validation("Sayfa numarası 1 veya daha büyük olmalıdır.");
        }

        if (pageSize < 1 || pageSize > MaxPageSize)
        {
            return Fail.Validation($"Sayfa boyutu 1 ile {MaxPageSize} arasında olmalıdır.");
        }

        var userId = actor.UserId;
        var query = db.Notifications.AsNoTracking().Where(n => n.UserId == userId);
        if (unreadOnly)
        {
            query = query.Where(n => !n.IsRead);
        }

        var total = await query.CountAsync(cancellationToken);
        var offset = (long)(page - 1) * pageSize;
        var items = offset >= total
            ? new List<NotificationItemView>()
            : await query
                .OrderByDescending(n => n.CreatedAt)
                .ThenByDescending(n => n.Id)
                .Skip((int)offset)
                .Take(pageSize)
                .Select(n => new NotificationItemView(n.Id, n.Type, n.Message, n.QuestionId, n.AssignmentId, n.CommentId, n.IsRead, n.CreatedAt))
                .ToListAsync(cancellationToken);

        return ServiceResult<NotificationListView>.Ok(new NotificationListView(page, pageSize, total, items));
    }

    public async Task<UnreadCountView> UnreadCountAsync(Actor actor, CancellationToken cancellationToken = default)
    {
        var userId = actor.UserId;
        var count = await db.Notifications.AsNoTracking().CountAsync(n => n.UserId == userId && !n.IsRead, cancellationToken);
        return new UnreadCountView(count);
    }

    public async Task<ServiceResult> MarkReadAsync(Actor actor, long notificationId, CancellationToken cancellationToken = default)
    {
        var userId = actor.UserId;
        var now = clock.UtcNow;
        var updated = await db.Notifications
            .Where(n => n.Id == notificationId && n.UserId == userId && !n.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true).SetProperty(n => n.ReadAt, now), cancellationToken);
        if (updated > 0)
        {
            return ServiceResult.Ok();
        }

        var exists = await db.Notifications.AsNoTracking().AnyAsync(n => n.Id == notificationId && n.UserId == userId, cancellationToken);
        return exists ? ServiceResult.Ok() : Fail.NotFound("Bildirim bulunamadı.");
    }

    public async Task<ServiceResult> MarkAllReadAsync(Actor actor, CancellationToken cancellationToken = default)
    {
        var userId = actor.UserId;
        var now = clock.UtcNow;
        await db.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true).SetProperty(n => n.ReadAt, now), cancellationToken);
        return ServiceResult.Ok();
    }
}
