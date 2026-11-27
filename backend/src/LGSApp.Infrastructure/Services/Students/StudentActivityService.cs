using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Questions;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Students;

public sealed record StudentUploadItemView(
    int Id,
    LessonRefView Lesson,
    TopicRefView? Topic,
    ImageView? Image,
    string? Description,
    string? PreviewText,
    DateTime CreatedAt,
    DateTime? PublishedAt,
    bool IsHidden,
    byte CorrectOption,
    int AnswerCount,
    int SolutionCount);

public sealed record StudentUploadsView(int Page, int PageSize, int TotalCount, IReadOnlyList<StudentUploadItemView> Items);

public sealed record StudentAnswerAssignmentView(int Id, string Title);

public sealed record StudentAnswerQuestionView(
    int Id,
    QuestionSource Source,
    LessonRefView Lesson,
    TopicRefView? Topic,
    string? PreviewText,
    ImageView? Image,
    byte CorrectOption);

public sealed record StudentExplanationView(
    int Id,
    string? Text,
    ImageView? Image,
    bool IsHidden,
    bool IsDeleted,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public sealed record StudentAnswerItemView(
    int AnswerId,
    DateTime AnsweredAt,
    byte SelectedOption,
    bool IsCorrect,
    StudentAnswerAssignmentView? Assignment,
    StudentAnswerQuestionView Question,
    StudentExplanationView? Explanation);

public sealed record StudentAnswersSummaryView(int TotalAnswers, int WithExplanation, int WithoutExplanation);

public sealed record StudentAnswersView(
    int Page,
    int PageSize,
    int TotalCount,
    StudentAnswersSummaryView Summary,
    IReadOnlyList<StudentAnswerItemView> Items);

public interface IStudentActivityService
{
    Task<ServiceResult<StudentUploadsView>> ListUploadsAsync(Actor actor, int studentId, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<ServiceResult<StudentAnswersView>> ListAnswersAsync(Actor actor, int studentId, int? lessonId, int page, int pageSize, CancellationToken cancellationToken = default);
}

public sealed class StudentActivityService(AppDbContext db, IFileUrlService urls) : IStudentActivityService
{
    private sealed record UploadRow(
        int Id,
        int LessonId,
        string LessonName,
        int? TopicId,
        string? TopicName,
        int? ImageFileId,
        string? Description,
        string? TextHead,
        DateTime CreatedAt,
        DateTime? PublishedAt,
        bool IsHidden,
        byte CorrectOption,
        int AnswerCount,
        int SolutionCount);

    private sealed record AnswerRow(
        int AnswerId,
        DateTime AnsweredAt,
        byte SelectedOption,
        bool IsCorrect,
        int? AssignmentId,
        string? AssignmentTitle,
        int QuestionId,
        QuestionSource Source,
        int LessonId,
        string LessonName,
        int? TopicId,
        string? TopicName,
        string? TextHead,
        int? ImageFileId,
        byte CorrectOption);

    private static ServiceResult<(int Page, int PageSize)> ValidatePaging(int page, int pageSize)
    {
        if (page < 1)
        {
            return Fail.Validation("Sayfa numarası 1 veya daha büyük olmalıdır.");
        }

        if (pageSize < 1 || pageSize > StudentDirectoryRules.MaxPageSize)
        {
            return Fail.Validation($"Sayfa boyutu 1 ile {StudentDirectoryRules.MaxPageSize} arasında olmalıdır.");
        }

        return ServiceResult<(int Page, int PageSize)>.Ok((page, pageSize));
    }

    private async Task<bool> IsStudentAsync(int studentId, CancellationToken cancellationToken) =>
        await db.Users.AsNoTracking().AnyAsync(
            u => u.Id == studentId && db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == Roles.OgrenciId),
            cancellationToken);

    public async Task<ServiceResult<StudentUploadsView>> ListUploadsAsync(Actor actor, int studentId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden(AnswerKeyScope.ModeratorOnlyMessage);
        }

        var paging = ValidatePaging(page, pageSize);
        if (!paging.Succeeded)
        {
            return ServiceResult<StudentUploadsView>.From(paging);
        }

        if (!await IsStudentAsync(studentId, cancellationToken))
        {
            return Fail.NotFound("Öğrenci bulunamadı.");
        }

        var source = db.Questions.AsNoTracking()
            .Where(q => q.AuthorUserId == studentId && q.Source == QuestionSource.Student);

        var total = await source.CountAsync(cancellationToken);
        var offset = (long)(page - 1) * pageSize;
        if (offset >= total)
        {
            return ServiceResult<StudentUploadsView>.Ok(new StudentUploadsView(page, pageSize, total, []));
        }

        var rows = await source
            .OrderByDescending(q => q.CreatedAt)
            .ThenByDescending(q => q.Id)
            .Skip((int)offset)
            .Take(pageSize)
            .Select(q => new UploadRow(
                q.Id,
                q.LessonId,
                q.Lesson.Name,
                q.TopicId,
                db.Topics.Where(t => t.Id == q.TopicId).Select(t => t.Name).FirstOrDefault(),
                q.ImageFileId,
                q.Description,
                q.Text == null ? null : q.Text.Substring(0, QuestionPoolRules.PreviewSourceLength),
                q.CreatedAt,
                q.PublishedAt,
                q.IsHidden,
                q.CorrectOption,
                db.Answers.Count(a => a.QuestionId == q.Id),
                db.Solutions.Count(s => s.QuestionId == q.Id && !s.IsDeleted)))
            .ToListAsync(cancellationToken);

        var images = await urls.GetAsync(rows.Select(r => r.ImageFileId), cancellationToken);

        var items = rows.Select(r => new StudentUploadItemView(
            r.Id,
            new LessonRefView(r.LessonId, r.LessonName),
            r.TopicId is int tid && r.TopicName is not null ? new TopicRefView(tid, r.TopicName) : null,
            images.Find(r.ImageFileId),
            r.Description,
            QuestionPoolRules.Preview(r.TextHead),
            r.CreatedAt,
            r.PublishedAt,
            r.IsHidden,
            r.CorrectOption,
            r.AnswerCount,
            r.SolutionCount)).ToList();

        return ServiceResult<StudentUploadsView>.Ok(new StudentUploadsView(page, pageSize, total, items));
    }

    public async Task<ServiceResult<StudentAnswersView>> ListAnswersAsync(Actor actor, int studentId, int? lessonId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden(AnswerKeyScope.ModeratorOnlyMessage);
        }

        var paging = ValidatePaging(page, pageSize);
        if (!paging.Succeeded)
        {
            return ServiceResult<StudentAnswersView>.From(paging);
        }

        if (!await IsStudentAsync(studentId, cancellationToken))
        {
            return Fail.NotFound("Öğrenci bulunamadı.");
        }

        var all = db.Answers.AsNoTracking().Where(a => a.UserId == studentId);

        var totalAnswers = await all.CountAsync(cancellationToken);
        var withExplanation = await all.CountAsync(
            a => db.Solutions.Any(s => s.AuthorUserId == studentId
                && s.Type == SolutionType.Student
                && !s.IsDeleted
                && (s.AnswerId == a.Id || s.QuestionId == a.QuestionId)),
            cancellationToken);
        var summary = new StudentAnswersSummaryView(totalAnswers, withExplanation, totalAnswers - withExplanation);

        var filtered = lessonId is int lid
            ? all.Where(a => db.Questions.Any(q => q.Id == a.QuestionId && q.LessonId == lid))
            : all;

        var total = lessonId is null ? totalAnswers : await filtered.CountAsync(cancellationToken);
        var offset = (long)(page - 1) * pageSize;
        if (offset >= total)
        {
            return ServiceResult<StudentAnswersView>.Ok(new StudentAnswersView(page, pageSize, total, summary, []));
        }

        var rows = await filtered
            .OrderByDescending(a => a.AnsweredAt)
            .ThenByDescending(a => a.Id)
            .Skip((int)offset)
            .Take(pageSize)
            .Select(a => new AnswerRow(
                a.Id,
                a.AnsweredAt,
                a.SelectedOption,
                a.IsCorrect,
                a.AssignmentId,
                db.Assignments.Where(x => x.Id == a.AssignmentId).Select(x => x.Title).FirstOrDefault(),
                a.QuestionId,
                db.Questions.Where(q => q.Id == a.QuestionId).Select(q => q.Source).First(),
                db.Questions.Where(q => q.Id == a.QuestionId).Select(q => q.LessonId).First(),
                db.Questions.Where(q => q.Id == a.QuestionId).Select(q => q.Lesson.Name).First(),
                db.Questions.Where(q => q.Id == a.QuestionId).Select(q => q.TopicId).First(),
                db.Topics.Where(t => t.Id == db.Questions.Where(q => q.Id == a.QuestionId).Select(q => q.TopicId).FirstOrDefault()).Select(t => t.Name).FirstOrDefault(),
                db.Questions.Where(q => q.Id == a.QuestionId).Select(q => q.Text == null ? null : q.Text.Substring(0, QuestionPoolRules.PreviewSourceLength)).First(),
                db.Questions.Where(q => q.Id == a.QuestionId).Select(q => q.ImageFileId).First(),
                db.Questions.Where(q => q.Id == a.QuestionId).Select(q => q.CorrectOption).First()))
            .ToListAsync(cancellationToken);

        var questionIds = rows.Select(r => r.QuestionId).Distinct().ToList();
        var solutions = await db.Solutions.AsNoTracking()
            .Where(s => s.AuthorUserId == studentId && s.Type == SolutionType.Student && questionIds.Contains(s.QuestionId))
            .ToListAsync(cancellationToken);

        var images = await urls.GetAsync(
            rows.Select(r => r.ImageFileId).Concat(solutions.Select(s => s.ImageFileId)),
            cancellationToken);

        Solution? Pick(AnswerRow row)
        {
            var forQuestion = solutions.Where(s => s.QuestionId == row.QuestionId).ToList();
            return forQuestion.Where(s => s.AnswerId == row.AnswerId && !s.IsDeleted).OrderByDescending(s => s.CreatedAt).ThenByDescending(s => s.Id).FirstOrDefault()
                ?? forQuestion.Where(s => !s.IsDeleted).OrderByDescending(s => s.CreatedAt).ThenByDescending(s => s.Id).FirstOrDefault()
                ?? forQuestion.Where(s => s.AnswerId == row.AnswerId).OrderByDescending(s => s.CreatedAt).ThenByDescending(s => s.Id).FirstOrDefault();
        }

        var items = rows.Select(r =>
        {
            var solution = Pick(r);
            return new StudentAnswerItemView(
                r.AnswerId,
                r.AnsweredAt,
                r.SelectedOption,
                r.IsCorrect,
                r.AssignmentId is int aid ? new StudentAnswerAssignmentView(aid, r.AssignmentTitle ?? string.Empty) : null,
                new StudentAnswerQuestionView(
                    r.QuestionId,
                    r.Source,
                    new LessonRefView(r.LessonId, r.LessonName),
                    r.TopicId is int tid && r.TopicName is not null ? new TopicRefView(tid, r.TopicName) : null,
                    QuestionPoolRules.Preview(r.TextHead),
                    images.Find(r.ImageFileId),
                    r.CorrectOption),
                solution is null
                    ? null
                    : new StudentExplanationView(
                        solution.Id,
                        solution.Text,
                        images.Find(solution.ImageFileId),
                        solution.IsHidden,
                        solution.IsDeleted,
                        solution.CreatedAt,
                        solution.UpdatedAt));
        }).ToList();

        return ServiceResult<StudentAnswersView>.Ok(new StudentAnswersView(page, pageSize, total, summary, items));
    }
}
