using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Assignments;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Points;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Questions;

public sealed record CreateQuestionCommand(
    int LessonId,
    int? TopicId,
    string? Text,
    int? ImageFileId,
    string? OptionA,
    string? OptionB,
    string? OptionC,
    string? OptionD,
    byte CorrectOption,
    string? Description,
    DateOnly? ScheduledPublishDate);

public sealed record MyQuestionView(
    int Id,
    LessonRefView Lesson,
    TopicRefView? Topic,
    ImageView? Image,
    DateTime CreatedAt,
    DateTime? PublishedAt,
    DateOnly? ScheduledPublishDate,
    bool IsHidden,
    int AnswerCount,
    int CorrectCount);

public sealed record MyQuestionListView(int Page, int PageSize, int TotalCount, IReadOnlyList<MyQuestionView> Items);

public interface IQuestionAuthoringService
{
    Task<ServiceResult<QuestionDetailView>> CreateAsync(Actor actor, CreateQuestionCommand command, CancellationToken cancellationToken = default);
    Task<ServiceResult<MyQuestionListView>> ListMineAsync(Actor actor, int page, int pageSize, CancellationToken cancellationToken = default);
}

public sealed class QuestionAuthoringService(
    AppDbContext db,
    ISettingsService settings,
    IStoredFileValidator fileValidator,
    IPointService points,
    IQuestionService questions,
    IFileUrlService urls,
    TurkeyTime clock) : IQuestionAuthoringService
{
    public const int DescriptionMaxLength = 4000;
    public const int MaxPageSize = 50;
    public const string DailyLimitMessage = "Günlük soru yükleme sınırına ulaştınız.";
    public const string ImageUsedMessage = "Seçilen fotoğraf daha önce kullanılmış.";

    private static readonly FilePurpose[] QuestionPurposes = [FilePurpose.QuestionImage];

    public async Task<ServiceResult<QuestionDetailView>> CreateAsync(Actor actor, CreateQuestionCommand command, CancellationToken cancellationToken = default)
    {
        if (!actor.IsStudent && !actor.IsModerator)
        {
            return Fail.Forbidden("Bu işlem için yetkiniz yok.");
        }

        var errors = new ValidationErrors();
        var text = AssignmentText.Clean(command.Text);
        string?[] options =
        [
            AssignmentText.CleanSingleLine(command.OptionA),
            AssignmentText.CleanSingleLine(command.OptionB),
            AssignmentText.CleanSingleLine(command.OptionC),
            AssignmentText.CleanSingleLine(command.OptionD)
        ];
        var description = AssignmentText.Clean(command.Description);

        if (command.CorrectOption is < 1 or > 4)
        {
            errors.Add("correctOption", "Doğru şık 1 ile 4 arasında olmalıdır.");
        }

        if (description is not null && description.Length > DescriptionMaxLength)
        {
            errors.Add("description", $"Açıklama en fazla {DescriptionMaxLength} karakter olabilir.");
        }

        var today = clock.Today;
        if (actor.IsStudent)
        {
            if (text is not null || options.Any(o => o is not null))
            {
                errors.Add("text", "Öğrenciler soruyu yalnızca fotoğraf olarak yükleyebilir.");
            }

            if (command.ScheduledPublishDate is not null)
            {
                errors.Add("scheduledPublishDate", "Planlı yayın yalnızca öğretmen veya müdür için kullanılabilir.");
            }

            if (command.ImageFileId is null)
            {
                errors.Add("imageFileId", "Soru fotoğrafı zorunludur.");
            }

            var minLength = await settings.GetIntAsync(SettingKeys.AciklamaMinKarakter, cancellationToken);
            if (description is null)
            {
                errors.Add("description", "Açıklama zorunludur. Soruyu çözerken nerede takıldığınızı anlatın.");
            }
            else if (description.Length < minLength)
            {
                errors.Add("description", $"Açıklama en az {minLength} karakter olmalıdır.");
            }
        }
        else
        {
            if (text is null && command.ImageFileId is null)
            {
                errors.Add("text", "Soru metni veya fotoğrafı zorunludur.");
            }

            if (text is not null && text.Length > AssignmentRules.QuestionTextMaxLength)
            {
                errors.Add("text", $"Soru metni en fazla {AssignmentRules.QuestionTextMaxLength} karakter olabilir.");
            }

            var provided = options.Count(o => o is not null);
            if (provided is > 0 and < 4)
            {
                var names = new[] { "optionA", "optionB", "optionC", "optionD" };
                errors.Add(names[Array.FindIndex(options, o => o is null)], "Şıklar ya hep birlikte girilmeli ya da hiç girilmemelidir.");
            }

            for (var i = 0; i < options.Length; i++)
            {
                if (options[i] is { } option && option.Length > AssignmentRules.OptionMaxLength)
                {
                    errors.Add($"option{(char)('A' + i)}", $"Şık en fazla {AssignmentRules.OptionMaxLength} karakter olabilir.");
                }
            }

            if (command.ScheduledPublishDate is DateOnly scheduled)
            {
                if (scheduled <= today)
                {
                    errors.Add("scheduledPublishDate", "Planlı yayın tarihi yarın veya daha sonrası olmalıdır.");
                }
                else if (scheduled > today.AddYears(1))
                {
                    errors.Add("scheduledPublishDate", AssignmentRules.FutureLimitMessage);
                }
            }
        }

        if (errors.Any)
        {
            return errors.ToFailure("Soru bilgileri geçersiz.");
        }

        var lessonActive = await db.Lessons.AsNoTracking().AnyAsync(l => l.Id == command.LessonId && l.IsActive, cancellationToken);
        if (!lessonActive)
        {
            return Fail.NotFound("Ders bulunamadı.");
        }

        if (command.TopicId is int topicId)
        {
            var topicOk = await db.Topics.AsNoTracking().AnyAsync(t => t.Id == topicId && t.LessonId == command.LessonId && t.IsActive, cancellationToken);
            if (!topicOk)
            {
                return Fail.NotFound("Konu bulunamadı.");
            }
        }

        var dailyLimit = actor.IsStudent ? await settings.GetIntAsync(SettingKeys.GunlukSoruYuklemeLimiti, cancellationToken) : 0;
        var uploadPoints = actor.IsStudent ? await settings.GetIntAsync(SettingKeys.PuanSoruYukleme, cancellationToken) : 0;
        var scoredPerDay = actor.IsStudent ? await settings.GetIntAsync(SettingKeys.PuanliSoruYuklemeGunluk, cancellationToken) : 0;

        try
        {
            var created = await db.ExecuteInTransactionAsync<ServiceResult<int>>(
                token => CreateCoreAsync(actor, command, text, options, description, today, dailyLimit, uploadPoints, scoredPerDay, token),
                cancellationToken);
            if (!created.Succeeded)
            {
                return ServiceResult<QuestionDetailView>.From(created);
            }

            return await questions.GetDetailAsync(actor, created.Value, cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation())
        {
            return Fail.Conflict(ImageUsedMessage);
        }
    }

    private async Task<ServiceResult<int>> CreateCoreAsync(
        Actor actor,
        CreateQuestionCommand command,
        string? text,
        string?[] options,
        string? description,
        DateOnly today,
        int dailyLimit,
        int uploadPoints,
        int scoredPerDay,
        CancellationToken token)
    {
        var userId = actor.UserId;
        var dayStart = TurkeyTime.ToUtc(today, TimeOnly.MinValue);

        if (actor.IsStudent)
        {
            await db.Users
                .FromSqlInterpolated($"SELECT * FROM [AspNetUsers] WITH (UPDLOCK, ROWLOCK) WHERE [Id] = {userId}")
                .AsNoTracking()
                .Select(u => u.Id)
                .FirstOrDefaultAsync(token);

            var usedToday = await db.Questions.AsNoTracking()
                .CountAsync(q => q.AuthorUserId == userId && q.Source == QuestionSource.Student && q.CreatedAt >= dayStart, token);
            if (usedToday >= dailyLimit)
            {
                return Fail.TooManyRequests(DailyLimitMessage);
            }
        }

        if (command.ImageFileId is int imageId)
        {
            var problem = await fileValidator.ValidateOneAsync(userId, imageId, QuestionPurposes, new StoredFileScope(LockRows: true), token);
            if (problem is not null)
            {
                var key = "imageFileId";
                var errors = new Dictionary<string, string[]> { [key] = [problem] };
                return problem == IStoredFileValidator.UsedMessage
                    ? Fail.Conflict(ImageUsedMessage)
                    : Fail.Validation(problem, errors);
            }
        }

        var now = clock.UtcNow;
        var publishNow = command.ScheduledPublishDate is null;
        var question = new Question
        {
            AuthorUserId = userId,
            LessonId = command.LessonId,
            TopicId = command.TopicId,
            Source = actor.IsStudent ? QuestionSource.Student : QuestionSource.Teacher,
            Text = text,
            ImageFileId = command.ImageFileId,
            OptionA = options[0],
            OptionB = options[1],
            OptionC = options[2],
            OptionD = options[3],
            CorrectOption = command.CorrectOption,
            Description = description,
            ScheduledPublishDate = command.ScheduledPublishDate,
            PublishedAt = publishNow ? now : null,
            CreatedAt = now
        };
        db.Questions.Add(question);
        await db.SaveChangesAsync(token);

        if (actor.IsStudent && uploadPoints > 0)
        {
            var scoredToday = await db.PointTransactions.AsNoTracking()
                .CountAsync(p => p.UserId == userId && p.Reason == PointReason.QuestionUploaded && p.LocalDate == today, token);
            if (scoredToday < scoredPerDay)
            {
                await points.AwardAsync(userId, uploadPoints, PointReason.QuestionUploaded, question.Id, null, null, null, token);
                await db.SaveChangesAsync(token);
            }
        }

        return ServiceResult<int>.Ok(question.Id);
    }

    public async Task<ServiceResult<MyQuestionListView>> ListMineAsync(Actor actor, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        if (!actor.IsStudent && !actor.IsModerator)
        {
            return Fail.Forbidden("Bu işlem için yetkiniz yok.");
        }

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var userId = actor.UserId;

        var query = db.Questions.AsNoTracking()
            .Where(q => q.AuthorUserId == userId
                && !db.AssignmentQuestions.Any(aq => aq.QuestionId == q.Id && aq.CreatedForAssignment));

        var total = await query.CountAsync(cancellationToken);
        var rows = await query
            .OrderByDescending(q => q.CreatedAt).ThenByDescending(q => q.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(q => new
            {
                q.Id,
                q.LessonId,
                LessonName = q.Lesson.Name,
                q.TopicId,
                TopicName = db.Topics.Where(t => t.Id == q.TopicId).Select(t => t.Name).FirstOrDefault(),
                q.ImageFileId,
                q.CreatedAt,
                q.PublishedAt,
                q.ScheduledPublishDate,
                q.IsHidden,
                AnswerCount = db.Answers.Count(a => a.QuestionId == q.Id),
                CorrectCount = db.Answers.Count(a => a.QuestionId == q.Id && a.IsCorrect)
            })
            .ToListAsync(cancellationToken);

        var images = await urls.GetAsync(rows.Select(r => r.ImageFileId), cancellationToken);
        var items = rows.Select(r => new MyQuestionView(
            r.Id,
            new LessonRefView(r.LessonId, r.LessonName),
            r.TopicId is int topicId && r.TopicName is not null ? new TopicRefView(topicId, r.TopicName) : null,
            images.Find(r.ImageFileId),
            r.CreatedAt,
            r.PublishedAt,
            r.ScheduledPublishDate,
            r.IsHidden,
            r.AnswerCount,
            r.CorrectCount)).ToList();

        return ServiceResult<MyQuestionListView>.Ok(new MyQuestionListView(page, pageSize, total, items));
    }
}
