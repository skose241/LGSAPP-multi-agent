using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Files;

public enum StoredFileProblem
{
    None = 0,
    Invalid = 1,
    Used = 2
}

public sealed record StoredFileScope(int? OwnQuestionId = null, int? OwnSolutionId = null, bool LockRows = false);

public interface IStoredFileValidator
{
    public const string InvalidMessage = "Seçilen fotoğraf geçersiz veya henüz hazır değil.";
    public const string UsedMessage = "Seçilen fotoğraf daha önce kullanılmış.";

    Task<IReadOnlyList<StoredFileProblem>> ValidateAsync(
        int userId,
        IReadOnlyList<int?> imageIds,
        IReadOnlyCollection<FilePurpose> allowedPurposes,
        StoredFileScope? scope = null,
        CancellationToken cancellationToken = default);
}

public static class StoredFileValidatorExtensions
{
    public static string? MessageFor(this StoredFileProblem problem) => problem switch
    {
        StoredFileProblem.Invalid => IStoredFileValidator.InvalidMessage,
        StoredFileProblem.Used => IStoredFileValidator.UsedMessage,
        _ => null
    };

    public static async Task<string?> ValidateOneAsync(
        this IStoredFileValidator validator,
        int userId,
        int imageId,
        IReadOnlyCollection<FilePurpose> allowedPurposes,
        StoredFileScope? scope = null,
        CancellationToken cancellationToken = default)
    {
        var result = await validator.ValidateAsync(userId, [imageId], allowedPurposes, scope, cancellationToken);
        return result[0].MessageFor();
    }
}

public sealed class StoredFileValidator(AppDbContext db) : IStoredFileValidator
{
    public async Task<IReadOnlyList<StoredFileProblem>> ValidateAsync(
        int userId,
        IReadOnlyList<int?> imageIds,
        IReadOnlyCollection<FilePurpose> allowedPurposes,
        StoredFileScope? scope = null,
        CancellationToken cancellationToken = default)
    {
        var problems = new StoredFileProblem[imageIds.Count];
        var ids = imageIds.Where(i => i is not null).Select(i => i!.Value).Distinct().ToList();
        if (ids.Count == 0)
        {
            return problems;
        }

        var ownQuestionId = scope?.OwnQuestionId ?? 0;
        var ownSolutionId = scope?.OwnSolutionId ?? 0;

        List<FileRow> rows;
        if (scope?.LockRows == true)
        {
            rows = [];
            foreach (var id in ids)
            {
                var row = await db.StoredFiles
                    .FromSqlInterpolated($"SELECT * FROM [StoredFiles] WITH (UPDLOCK, ROWLOCK) WHERE [Id] = {id}")
                    .AsNoTracking()
                    .Select(f => new FileRow(f.Id, f.UploadedByUserId, f.Status, f.Purpose))
                    .FirstOrDefaultAsync(cancellationToken);
                if (row is not null)
                {
                    rows.Add(row);
                }
            }
        }
        else
        {
            rows = await db.StoredFiles.AsNoTracking()
                .Where(f => ids.Contains(f.Id))
                .Select(f => new FileRow(f.Id, f.UploadedByUserId, f.Status, f.Purpose))
                .ToListAsync(cancellationToken);
        }

        var files = rows.ToDictionary(f => f.Id);
        var usedByQuestions = (await db.Questions.AsNoTracking()
            .Where(q => q.ImageFileId != null && ids.Contains(q.ImageFileId.Value) && q.Id != ownQuestionId)
            .Select(q => q.ImageFileId!.Value)
            .ToListAsync(cancellationToken)).ToHashSet();
        var usedBySolutions = (await db.Solutions.AsNoTracking()
            .Where(s => s.ImageFileId != null && ids.Contains(s.ImageFileId.Value) && s.Id != ownSolutionId)
            .Select(s => s.ImageFileId!.Value)
            .ToListAsync(cancellationToken)).ToHashSet();

        var seen = new HashSet<int>();
        for (var i = 0; i < imageIds.Count; i++)
        {
            if (imageIds[i] is not int id)
            {
                continue;
            }

            if (!files.TryGetValue(id, out var file)
                || file.UploadedByUserId != userId
                || file.Status != FileStatus.Ready
                || !allowedPurposes.Contains(file.Purpose))
            {
                problems[i] = StoredFileProblem.Invalid;
            }
            else if (usedByQuestions.Contains(id) || usedBySolutions.Contains(id) || !seen.Add(id))
            {
                problems[i] = StoredFileProblem.Used;
            }
        }

        return problems;
    }

    private sealed record FileRow(int Id, int UploadedByUserId, FileStatus Status, FilePurpose Purpose);
}
