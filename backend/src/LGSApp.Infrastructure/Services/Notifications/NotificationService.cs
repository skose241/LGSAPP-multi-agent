using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Notifications;

public sealed record NotificationDraft(
    int RecipientUserId,
    NotificationType Type,
    string Message,
    int? QuestionId = null,
    int? AssignmentId = null,
    int? CommentId = null,
    Comment? CommentEntity = null,
    int? SenderUserId = null,
    int? RunId = null);

public interface INotificationService
{
    Task<bool> NotifyAsync(NotificationDraft draft, bool coalesce = false, CancellationToken cancellationToken = default);
    Task<int> NotifyManyAsync(IReadOnlyCollection<int> recipientUserIds, NotificationType type, string message, int? questionId, int? senderUserId, CancellationToken cancellationToken = default);
}

public sealed class NotificationService(AppDbContext db, TurkeyTime clock) : INotificationService
{
    public async Task<bool> NotifyAsync(NotificationDraft draft, bool coalesce = false, CancellationToken cancellationToken = default)
    {
        if (draft.RecipientUserId == draft.SenderUserId)
        {
            return false;
        }

        if (await db.UserRoles.AnyAsync(ur => ur.UserId == draft.RecipientUserId && ur.RoleId == Roles.AiId, cancellationToken))
        {
            return false;
        }

        if (coalesce)
        {
            var existing = await db.Notifications.FirstOrDefaultAsync(
                n => n.UserId == draft.RecipientUserId
                    && n.Type == draft.Type
                    && n.QuestionId == draft.QuestionId
                    && !n.IsRead,
                cancellationToken);

            if (existing is not null)
            {
                existing.Message = draft.Message;
                existing.CreatedAt = clock.UtcNow;
                if (draft.CommentEntity is not null)
                {
                    existing.Comment = draft.CommentEntity;
                }
                else if (draft.CommentId is not null)
                {
                    existing.CommentId = draft.CommentId;
                }

                return true;
            }
        }

        db.Notifications.Add(new Notification
        {
            UserId = draft.RecipientUserId,
            Type = draft.Type,
            Message = draft.Message,
            QuestionId = draft.QuestionId,
            AssignmentId = draft.AssignmentId,
            CommentId = draft.CommentId,
            Comment = draft.CommentEntity,
            RunId = draft.RunId,
            CreatedAt = clock.UtcNow
        });

        return true;
    }

    public async Task<int> NotifyManyAsync(IReadOnlyCollection<int> recipientUserIds, NotificationType type, string message, int? questionId, int? senderUserId, CancellationToken cancellationToken = default)
    {
        var candidates = recipientUserIds.Where(id => id != senderUserId).Distinct().ToList();
        if (candidates.Count == 0)
        {
            return 0;
        }

        var aiIds = await db.UserRoles
            .Where(ur => ur.RoleId == Roles.AiId && candidates.Contains(ur.UserId))
            .Select(ur => ur.UserId)
            .ToListAsync(cancellationToken);

        var now = clock.UtcNow;
        var count = 0;
        foreach (var id in candidates.Except(aiIds))
        {
            db.Notifications.Add(new Notification
            {
                UserId = id,
                Type = type,
                Message = message,
                QuestionId = questionId,
                CreatedAt = now
            });
            count++;
        }

        return count;
    }
}
