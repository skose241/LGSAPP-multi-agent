using LGSApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Common;

public static class AnswerKeyScope
{
    public const string NoBranchMessage = "Hesabınıza branş dersi tanımlanmamış.";
    public const string WrongBranchMessage = "Yalnızca branş dersinizin sorularında bu işlemi yapabilirsiniz.";
    public const string ViewWrongBranchMessage = "Yalnızca branş dersinizin sorularını görüntüleyebilirsiniz.";
    public const string ModeratorOnlyMessage = "Bu işlemi yalnızca öğretmen veya müdür yapabilir.";

    public static Failure? Authorize(Actor actor, int? branchLessonId, int lessonId, string wrongBranchMessage = WrongBranchMessage)
    {
        if (actor.IsMudur)
        {
            return null;
        }

        if (!actor.IsTeacher)
        {
            return Fail.Forbidden(ModeratorOnlyMessage);
        }

        if (branchLessonId is null)
        {
            return Fail.Forbidden(NoBranchMessage);
        }

        return branchLessonId == lessonId ? null : Fail.Forbidden(wrongBranchMessage);
    }

    public static async Task<Failure?> AuthorizeAsync(AppDbContext db, Actor actor, int lessonId, CancellationToken cancellationToken, string wrongBranchMessage = WrongBranchMessage)
    {
        if (!actor.IsTeacher)
        {
            return Authorize(actor, null, lessonId, wrongBranchMessage);
        }

        var branch = await ReadBranchAsync(db, actor.UserId, cancellationToken);
        return Authorize(actor, branch, lessonId, wrongBranchMessage);
    }

    public static async Task<bool> CanResolveAsync(AppDbContext db, Actor actor, int lessonId, CancellationToken cancellationToken) =>
        await AuthorizeAsync(db, actor, lessonId, cancellationToken) is null;

    public static Task<int?> ReadBranchAsync(AppDbContext db, int userId, CancellationToken cancellationToken) =>
        db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.BranchLessonId)
            .FirstOrDefaultAsync(cancellationToken);
}
