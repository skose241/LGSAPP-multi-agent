using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Assignments;

public interface IAssignmentNotifier
{
    Task<int> NotifyStudentsAsync(int assignmentId, NotificationType type, string message, CancellationToken cancellationToken = default);
}

public sealed class AssignmentNotifier(AppDbContext db, TurkeyTime clock) : IAssignmentNotifier
{
    private const int MessageMaxLength = 500;

    public Task<int> NotifyStudentsAsync(int assignmentId, NotificationType type, string message, CancellationToken cancellationToken = default)
    {
        var users = db.Model.FindEntityType(typeof(ApplicationUser))!.GetTableName()!;
        var userRoles = db.Model.FindEntityType(typeof(IdentityUserRole<int>))!.GetTableName()!;
        var text = message.Length > MessageMaxLength ? message[..MessageMaxLength] : message;
        var sql =
            $"INSERT INTO [Notifications] ([UserId], [Type], [Message], [AssignmentId], [IsRead], [CreatedAt]) " +
            $"SELECT u.[Id], {{0}}, {{1}}, {{2}}, 0, {{3}} FROM [{users}] AS u " +
            $"WHERE u.[IsBanned] = 0 AND EXISTS (SELECT 1 FROM [{userRoles}] AS ur WHERE ur.[UserId] = u.[Id] AND ur.[RoleId] = {{4}})";

        return db.Database.ExecuteSqlRawAsync(sql, [(byte)type, text, assignmentId, clock.UtcNow, Roles.OgrenciId], cancellationToken);
    }
}
