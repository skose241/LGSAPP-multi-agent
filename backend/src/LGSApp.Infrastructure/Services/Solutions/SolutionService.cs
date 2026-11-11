using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Notifications;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Solutions;

public sealed record SolutionView(
    int Id,
    SolutionType Type,
    UserRefView? Author,
    string? Text,
    int? ImageFileId,
    bool IsHidden,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    int CommentCount,
    bool IsMine,
    bool CanEdit,
    byte[]? RowVersion);

public sealed record SolutionListView(int QuestionId, IReadOnlyList<SolutionView> Items);

public sealed record CreateTeacherSolutionCommand(string? Text, int? ImageFileId);

public sealed record UpdateSolutionCommand(string? Text, int? ImageFileId, byte[] RowVersion);

public interface ISolutionService
{
    Task<ServiceResult<SolutionListView>> ListAsync(Actor actor, int questionId, CancellationToken cancellationToken = default);
    Task<ServiceResult<SolutionView>> CreateTeacherAsync(Actor actor, int questionId, CreateTeacherSolutionCommand command, CancellationToken cancellationToken = default);
    Task<ServiceResult<SolutionView>> UpdateAsync(Actor actor, int solutionId, UpdateSolutionCommand command, CancellationToken cancellationToken = default);
}

public sealed class SolutionService(
    AppDbContext db,
    ISettingsService settings,
    IQuestionAccessService access,
    INotificationService notifications,
    UserLookupService users,
    TurkeyTime clock) : ISolutionService
{
    public async Task<ServiceResult<SolutionListView>> ListAsync(Actor actor, int questionId, CancellationToken cancellationToken = default)
    {
        var gate = await access.RequireDiscussionAsync(questionId, actor, "Çözümleri görmek için önce soruyu cevaplamalısınız.", cancellationToken);
        if (!gate.Succeeded)
        {
            return ServiceResult<SolutionListView>.From(gate);
        }

        var rows = await db.Solutions.AsNoTracking()
            .Where(s => s.QuestionId == questionId && !s.IsDeleted && (actor.IsModerator || !s.IsHidden))
            .ToListAsync(cancellationToken);

        var counts = await db.Comments.AsNoTracking()
            .Where(c => c.QuestionId == questionId && c.SolutionId != null && c.Status == CommentStatus.Active)
            .GroupBy(c => c.SolutionId)
            .Select(g => new { SolutionId = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var countBySolution = counts.Where(c => c.SolutionId != null).ToDictionary(c => c.SolutionId!.Value, c => c.Count);

        var people = await users.GetAsync(rows.Select(r => r.AuthorUserId), actor.IsModerator, cancellationToken);

        var ordered = rows
            .OrderBy(s => s.Type switch
            {
                SolutionType.Teacher => 0,
                SolutionType.Ai => 1,
                _ => 2
            })
            .ThenBy(s => s.CreatedAt)
            .ThenBy(s => s.Id)
            .Select(s => ToView(s, actor, people, countBySolution.GetValueOrDefault(s.Id)))
            .ToList();

        return ServiceResult<SolutionListView>.Ok(new SolutionListView(questionId, ordered));
    }

    public async Task<ServiceResult<SolutionView>> CreateTeacherAsync(Actor actor, int questionId, CreateTeacherSolutionCommand command, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür çözüm ekleyebilir.");
        }

        var validation = await ValidateContentAsync(actor, command.Text, command.ImageFileId, null, cancellationToken);
        if (validation.Failure is { } failure)
        {
            return failure;
        }

        var question = await db.Questions.AsNoTracking()
            .Where(q => q.Id == questionId)
            .Select(q => new { q.Id })
            .FirstOrDefaultAsync(cancellationToken);
        if (question is null)
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        var exists = await db.Solutions.AnyAsync(
            s => s.QuestionId == questionId && s.Type == SolutionType.Teacher && !s.IsDeleted,
            cancellationToken);
        if (exists)
        {
            return Fail.Conflict("Bu soru için zaten bir öğretmen çözümü var. Mevcut çözümü düzenleyebilirsiniz.");
        }

        var solution = new Solution
        {
            QuestionId = questionId,
            AuthorUserId = actor.UserId,
            Type = SolutionType.Teacher,
            Text = validation.Text,
            ImageFileId = command.ImageFileId,
            CreatedAt = clock.UtcNow
        };
        db.Solutions.Add(solution);

        var wrongUserIds = await db.Answers.AsNoTracking()
            .Where(a => a.QuestionId == questionId && !a.IsCorrect)
            .Select(a => a.UserId)
            .Distinct()
            .ToListAsync(cancellationToken);
        await notifications.NotifyManyAsync(
            wrongUserIds,
            NotificationType.TeacherSolution,
            "Yanlış cevapladığınız soruya öğretmen çözümü eklendi.",
            questionId,
            actor.UserId,
            cancellationToken);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation())
        {
            return Fail.Conflict("Bu soru için zaten bir öğretmen çözümü var veya seçilen fotoğraf daha önce kullanılmış.");
        }

        var people = await users.GetAsync([solution.AuthorUserId], actor.IsModerator, cancellationToken);
        return ServiceResult<SolutionView>.Ok(ToView(solution, actor, people, 0));
    }

    public async Task<ServiceResult<SolutionView>> UpdateAsync(Actor actor, int solutionId, UpdateSolutionCommand command, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür çözümü düzenleyebilir.");
        }

        var solution = await db.Solutions.FirstOrDefaultAsync(s => s.Id == solutionId && !s.IsDeleted, cancellationToken);
        if (solution is null)
        {
            return Fail.NotFound("Çözüm bulunamadı.");
        }

        if (solution.Type != SolutionType.Teacher || (!actor.IsMudur && solution.AuthorUserId != actor.UserId))
        {
            return Fail.Forbidden("Bu çözümü düzenleme yetkiniz yok.");
        }

        if (!solution.RowVersion.SequenceEqual(command.RowVersion))
        {
            return Fail.Conflict("Çözüm başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }

        var validation = await ValidateContentAsync(actor, command.Text, command.ImageFileId, solution.Id, cancellationToken);
        if (validation.Failure is { } failure)
        {
            return failure;
        }

        db.Entry(solution).Property(s => s.RowVersion).OriginalValue = command.RowVersion;
        solution.Text = validation.Text;
        solution.ImageFileId = command.ImageFileId;
        solution.UpdatedAt = clock.UtcNow;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Fail.Conflict("Çözüm başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation())
        {
            return Fail.Conflict("Seçilen fotoğraf daha önce kullanılmış.");
        }

        var people = await users.GetAsync([solution.AuthorUserId], true, cancellationToken);
        var commentCount = await db.Comments.CountAsync(c => c.SolutionId == solution.Id && c.Status == CommentStatus.Active, cancellationToken);
        return ServiceResult<SolutionView>.Ok(ToView(solution, actor, people, commentCount));
    }

    private sealed record ContentCheck(string? Text, Failure? Failure);

    private async Task<ContentCheck> ValidateContentAsync(Actor actor, string? rawText, int? imageId, int? currentSolutionId, CancellationToken cancellationToken)
    {
        var maxLength = await settings.GetIntAsync(SettingKeys.CozumMaxKarakter, cancellationToken);
        var text = string.IsNullOrWhiteSpace(rawText) ? null : rawText.Trim();

        if (text is null && imageId is null)
        {
            return new ContentCheck(null, Fail.Validation("Çözüm için metin veya fotoğraf gereklidir."));
        }

        if (text is not null && text.Length > maxLength)
        {
            return new ContentCheck(null, Fail.Validation($"Çözüm metni en fazla {maxLength} karakter olabilir."));
        }

        if (imageId is int fileId)
        {
            var file = await db.StoredFiles.AsNoTracking()
                .Where(f => f.Id == fileId)
                .Select(f => new { f.UploadedByUserId, f.Status, f.Purpose })
                .FirstOrDefaultAsync(cancellationToken);

            if (file is null
                || file.UploadedByUserId != actor.UserId
                || file.Status != FileStatus.Ready
                || file.Purpose != FilePurpose.SolutionImage)
            {
                return new ContentCheck(null, Fail.Validation("Seçilen fotoğraf geçersiz veya henüz hazır değil."));
            }

            var used = await db.Solutions.AnyAsync(s => s.ImageFileId == fileId && s.Id != currentSolutionId, cancellationToken)
                || await db.Questions.AnyAsync(q => q.ImageFileId == fileId, cancellationToken);
            if (used)
            {
                return new ContentCheck(null, Fail.Validation("Seçilen fotoğraf daha önce kullanılmış."));
            }
        }

        return new ContentCheck(text, null);
    }

    private static SolutionView ToView(Solution s, Actor actor, IReadOnlyDictionary<int, UserRefView> people, int commentCount)
    {
        var isMine = s.AuthorUserId == actor.UserId;
        var canEdit = actor.IsModerator && s.Type == SolutionType.Teacher && (actor.IsMudur || isMine);
        people.TryGetValue(s.AuthorUserId, out var author);

        return new SolutionView(
            s.Id,
            s.Type,
            author,
            s.Text,
            s.ImageFileId,
            s.IsHidden,
            s.CreatedAt,
            s.UpdatedAt,
            commentCount,
            isMine,
            canEdit,
            canEdit ? s.RowVersion : null);
    }
}
