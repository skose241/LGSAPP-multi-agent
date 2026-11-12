using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Scheduler;

public interface IRunNotifier
{
    Task<int> NotifyRoleAsync(int roleId, NotificationType type, string message, int runId, CancellationToken cancellationToken = default);
}

public sealed class RunNotifier(AppDbContext db, TurkeyTime clock) : IRunNotifier
{
    private const int MessageMaxLength = 500;

    public async Task<int> NotifyRoleAsync(int roleId, NotificationType type, string message, int runId, CancellationToken cancellationToken = default)
    {
        var users = db.Model.FindEntityType(typeof(ApplicationUser))!.GetTableName()!;
        var userRoles = db.Model.FindEntityType(typeof(IdentityUserRole<int>))!.GetTableName()!;
        var text = message.Length > MessageMaxLength ? message[..MessageMaxLength] : message;
        var sql =
            $"INSERT INTO [Notifications] ([UserId], [Type], [Message], [RunId], [IsRead], [CreatedAt]) " +
            $"SELECT u.[Id], {{0}}, {{1}}, {{2}}, 0, {{3}} FROM [{users}] AS u " +
            $"WHERE u.[IsBanned] = 0 " +
            $"AND EXISTS (SELECT 1 FROM [{userRoles}] AS ur WHERE ur.[UserId] = u.[Id] AND ur.[RoleId] = {{4}}) " +
            $"AND NOT EXISTS (SELECT 1 FROM [Notifications] AS n WHERE n.[UserId] = u.[Id] AND n.[Type] = {{0}} AND n.[RunId] = {{2}})";

        try
        {
            return await db.Database.ExecuteSqlRawAsync(sql, [(byte)type, text, runId, clock.UtcNow, roleId], cancellationToken);
        }
        catch (SqlException ex) when (ex.Number is 2601 or 2627)
        {
            return 0;
        }
    }
}
