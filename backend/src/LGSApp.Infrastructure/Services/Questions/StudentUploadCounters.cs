using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Questions;

public static class StudentUploadCounters
{
    public static Task<int> CountUploadedAsync(this AppDbContext db, int userId, DateOnly today, CancellationToken cancellationToken)
    {
        var dayStart = TurkeyTime.ToUtc(today, TimeOnly.MinValue);
        return db.Questions.AsNoTracking()
            .CountAsync(q => q.AuthorUserId == userId && q.Source == QuestionSource.Student && q.CreatedAt >= dayStart, cancellationToken);
    }

    public static Task<int> CountScoredAsync(this AppDbContext db, int userId, DateOnly today, CancellationToken cancellationToken) =>
        db.PointTransactions.AsNoTracking()
            .CountAsync(p => p.UserId == userId && p.Reason == PointReason.QuestionUploaded && p.LocalDate == today, cancellationToken);
}
