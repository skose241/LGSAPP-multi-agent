using System.Text.Json;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Questions;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Assignments;

public sealed record NewAssignmentQuestion(
    string? Text,
    int? ImageFileId,
    string? OptionA,
    string? OptionB,
    string? OptionC,
    string? OptionD,
    byte? CorrectOption,
    int? TopicId,
    string? Description);

public sealed record UpdateAssignmentQuestionCommand(
    string? Text,
    int? ImageFileId,
    string? OptionA,
    string? OptionB,
    string? OptionC,
    string? OptionD,
    byte? CorrectOption,
    int? TopicId,
    string? Description,
    byte[]? RowVersion);

public interface IAssignmentQuestionService
{
    Task<ServiceResult<AddedQuestionsView>> AddAsync(Actor actor, int assignmentId, IReadOnlyList<NewAssignmentQuestion?> rawItems, CancellationToken cancellationToken = default);
    Task<ServiceResult<AddedQuestionsView>> AttachAsync(Actor actor, int assignmentId, IReadOnlyList<int> questionIds, CancellationToken cancellationToken = default);
    Task<ServiceResult> RemoveAsync(Actor actor, int assignmentId, int questionId, CancellationToken cancellationToken = default);
    Task<ServiceResult> ReorderAsync(Actor actor, int assignmentId, IReadOnlyList<int> questionIds, CancellationToken cancellationToken = default);
    Task<ServiceResult<AddedQuestionView>> UpdateAsync(Actor actor, int assignmentId, int questionId, UpdateAssignmentQuestionCommand command, CancellationToken cancellationToken = default);
}

public sealed class AssignmentQuestionService(AppDbContext db, TurkeyTime clock, IStoredFileValidator fileValidator, IAnswerKeyService answerKeys) : IAssignmentQuestionService
{
    private const string NotEditableMessage = "Yalnızca taslak veya başlamamış planlı ödevlerin soruları değiştirilebilir.";
    private const string LinkedElsewhereMessage = "Soru başka bir ödevde kullanılıyor.";
    private const string OptionsTogetherMessage = "Şıklar ya hep birlikte girilmeli ya da hiç girilmemelidir.";

    private static readonly FilePurpose[] AllowedPurposes = [FilePurpose.AssignmentImage, FilePurpose.QuestionImage];

    private sealed record ContentDraft(
        string? Text,
        int? ImageFileId,
        string?[] Options,
        byte? CorrectOption,
        string? Description);

    public async Task<ServiceResult<AddedQuestionsView>> AddAsync(Actor actor, int assignmentId, IReadOnlyList<NewAssignmentQuestion?> rawItems, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür ödeve soru ekleyebilir.");
        }

        if (rawItems.Count == 0)
        {
            return Fail.Validation("En az bir soru gönderilmelidir.");
        }

        if (rawItems.Count > AssignmentRules.MaxBatchSize)
        {
            return Fail.Validation($"Tek seferde en fazla {AssignmentRules.MaxBatchSize} soru eklenebilir.");
        }

        var errors = new ValidationErrors();
        for (var i = 0; i < rawItems.Count; i++)
        {
            if (rawItems[i] is null)
            {
                errors.Add($"items[{i}]", "Soru bilgisi boş olamaz.");
            }
        }

        if (errors.Any)
        {
            return errors.ToFailure("Soru bilgileri geçersiz.");
        }

        var items = rawItems.Select(i => i!).ToList();
        var drafts = new List<ContentDraft>(items.Count);
        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
            var draft = new ContentDraft(
                AssignmentText.Clean(item.Text),
                item.ImageFileId,
                [
                    AssignmentText.CleanSingleLine(item.OptionA),
                    AssignmentText.CleanSingleLine(item.OptionB),
                    AssignmentText.CleanSingleLine(item.OptionC),
                    AssignmentText.CleanSingleLine(item.OptionD)
                ],
                item.CorrectOption,
                AssignmentText.Clean(item.Description));
            ValidateShape(draft, $"items[{i}].", errors);
            drafts.Add(draft);
        }

        if (errors.Any)
        {
            return errors.ToFailure("Soru bilgileri geçersiz.");
        }

        return await db.ExecuteInTransactionAsync<ServiceResult<AddedQuestionsView>>(async token =>
        {
            var assignment = await AssignmentGate.LockAsync(db, assignmentId, token);
            var gate = CheckEditable(actor, assignment);
            if (gate is Failure failure)
            {
                return failure;
            }

            var branchDenied = await AuthorizeBranchAsync(actor, assignment!.LessonId, token);
            if (branchDenied is Failure branchFailure)
            {
                return branchFailure;
            }

            var existing = await db.AssignmentQuestions
                .Where(aq => aq.AssignmentId == assignmentId)
                .GroupBy(aq => aq.AssignmentId)
                .Select(g => new { Count = g.Count(), MaxOrder = g.Max(x => x.OrderNo) })
                .FirstOrDefaultAsync(token);
            var existingCount = existing?.Count ?? 0;

            var requestedImages = drafts.Where(d => d.ImageFileId is not null).Select(d => d.ImageFileId!.Value).Distinct().ToList();
            var replayed = requestedImages.Count == 0
                ? new Dictionary<int, AddedQuestionView>()
                : (await (
                    from aq in db.AssignmentQuestions.AsNoTracking()
                    where aq.AssignmentId == assignmentId && aq.CreatedForAssignment
                    join q in db.Questions.AsNoTracking() on aq.QuestionId equals q.Id
                    where q.ImageFileId != null && requestedImages.Contains(q.ImageFileId.Value)
                    select new { ImageId = q.ImageFileId!.Value, q.Id, aq.OrderNo, q.RowVersion }).ToListAsync(token))
                    .ToDictionary(x => x.ImageId, x => new AddedQuestionView(x.Id, x.OrderNo, x.RowVersion));

            bool IsReplay(int i) => drafts[i].ImageFileId is int imageId && replayed.ContainsKey(imageId);
            var newIndexes = Enumerable.Range(0, drafts.Count).Where(i => !IsReplay(i)).ToList();

            if (newIndexes.Count == 0)
            {
                var replayOnly = Enumerable.Range(0, drafts.Count).Select(i => replayed[drafts[i].ImageFileId!.Value]).ToList();
                return ServiceResult<AddedQuestionsView>.Ok(new AddedQuestionsView(replayOnly.Count, existingCount, replayOnly));
            }

            if (existingCount + newIndexes.Count > AssignmentRules.MaxQuestionsPerAssignment)
            {
                return Fail.Conflict($"Bir ödeve en fazla {AssignmentRules.MaxQuestionsPerAssignment} soru eklenebilir.");
            }

            var topicIds = items.Where(i => i.TopicId is not null).Select(i => i.TopicId!.Value).Distinct().ToList();
            HashSet<int> validTopics = topicIds.Count == 0
                ? []
                : (await db.Topics.AsNoTracking()
                    .Where(t => topicIds.Contains(t.Id) && t.LessonId == assignment!.LessonId)
                    .Select(t => t.Id)
                    .ToListAsync(token)).ToHashSet();

            var imageErrors = await ValidateImagesAsync(actor, drafts.Select((d, i) => IsReplay(i) ? null : d.ImageFileId).ToList(), "items[{0}].imageFileId", null, token);
            for (var i = 0; i < items.Count; i++)
            {
                if (items[i].TopicId is int topicId && !validTopics.Contains(topicId))
                {
                    imageErrors.Add($"items[{i}].topicId", "Konu bu derse ait değil.");
                }
            }

            if (imageErrors.Any)
            {
                return imageErrors.ToFailure("Soru bilgileri geçersiz.");
            }

            var now = clock.UtcNow;
            var questions = new List<Question>(newIndexes.Count);
            foreach (var i in newIndexes)
            {
                var d = drafts[i];
                questions.Add(new Question
                {
                    AuthorUserId = actor.UserId,
                    LessonId = assignment!.LessonId,
                    TopicId = items[i].TopicId,
                    Source = QuestionSource.Teacher,
                    Text = d.Text,
                    ImageFileId = d.ImageFileId,
                    OptionA = d.Options[0],
                    OptionB = d.Options[1],
                    OptionC = d.Options[2],
                    OptionD = d.Options[3],
                    CorrectOption = d.CorrectOption!.Value,
                    Description = d.Description,
                    CreatedAt = now
                });
            }

            db.Questions.AddRange(questions);
            try
            {
                await db.SaveChangesAsync(token);
            }
            catch (DbUpdateException ex) when (ex.IsUniqueViolation())
            {
                return Fail.Conflict("Seçilen fotoğraflardan biri başka bir soruda kullanılıyor.");
            }

            var startOrder = (existing?.MaxOrder ?? 0) + 1;
            var links = questions.Select((q, i) => new AssignmentQuestion
            {
                AssignmentId = assignmentId,
                QuestionId = q.Id,
                OrderNo = startOrder + i,
                CreatedForAssignment = true
            }).ToList();
            db.AssignmentQuestions.AddRange(links);
            await db.SaveChangesAsync(token);

            var created = questions
                .Select((q, i) => new AddedQuestionView(q.Id, startOrder + i, q.RowVersion))
                .ToList();
            var cursor = 0;
            var added = new List<AddedQuestionView>(drafts.Count);
            for (var i = 0; i < drafts.Count; i++)
            {
                added.Add(IsReplay(i) ? replayed[drafts[i].ImageFileId!.Value] : created[cursor++]);
            }

            return ServiceResult<AddedQuestionsView>.Ok(new AddedQuestionsView(added.Count, existingCount + created.Count, added));
        }, cancellationToken);
    }

    public async Task<ServiceResult<AddedQuestionsView>> AttachAsync(Actor actor, int assignmentId, IReadOnlyList<int> questionIds, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür ödeve soru ekleyebilir.");
        }

        if (questionIds.Count == 0)
        {
            return Fail.Validation("En az bir soru seçilmelidir.");
        }

        if (questionIds.Count > AssignmentRules.MaxBatchSize)
        {
            return Fail.Validation($"Tek seferde en fazla {AssignmentRules.MaxBatchSize} soru eklenebilir.");
        }

        var errors = new ValidationErrors();
        var seen = new HashSet<int>();
        for (var i = 0; i < questionIds.Count; i++)
        {
            if (!seen.Add(questionIds[i]))
            {
                errors.Add($"questionIds[{i}]", "Aynı soru birden fazla kez seçilmiş.");
            }
        }

        if (errors.Any)
        {
            return errors.ToFailure("Soru seçimi geçersiz.");
        }

        return await db.ExecuteInTransactionAsync<ServiceResult<AddedQuestionsView>>(async token =>
        {
            var assignment = await AssignmentGate.LockAsync(db, assignmentId, token);
            var gate = CheckEditable(actor, assignment);
            if (gate is Failure failure)
            {
                return failure;
            }

            var json = JsonSerializer.Serialize(questionIds);
            var branchDenied = await AuthorizeBranchAsync(actor, assignment!.LessonId, token);
            if (branchDenied is Failure branchFailure)
            {
                return branchFailure;
            }

            var found = await db.Questions
                .FromSqlInterpolated($"SELECT * FROM [Questions] WITH (UPDLOCK, ROWLOCK) WHERE [Id] IN (SELECT CAST([value] AS int) FROM OPENJSON({json}))")
                .AsNoTracking()
                .Select(q => new { q.Id, q.LessonId, q.PublishedAt, q.IsHidden, q.Source, q.AuthorUserId })
                .ToListAsync(token);
            var byId = found.ToDictionary(q => q.Id);

            var linked = (await db.AssignmentQuestions.AsNoTracking()
                .Where(aq => questionIds.Contains(aq.QuestionId))
                .Select(aq => aq.QuestionId)
                .ToListAsync(token)).ToHashSet();
            var answered = (await db.Answers.AsNoTracking()
                .Where(a => questionIds.Contains(a.QuestionId))
                .Select(a => a.QuestionId)
                .Distinct()
                .ToListAsync(token)).ToHashSet();

            var linkedConflict = false;
            var otherErrors = false;
            void Reject(string key, string message)
            {
                otherErrors = true;
                errors.Add(key, message);
            }

            for (var i = 0; i < questionIds.Count; i++)
            {
                var key = $"questionIds[{i}]";
                if (!byId.TryGetValue(questionIds[i], out var q))
                {
                    Reject(key, "Soru bulunamadı.");
                    continue;
                }

                if (q.IsHidden)
                {
                    Reject(key, "Gizlenmiş soru ödeve eklenemez.");
                }
                else if (q.LessonId != assignment!.LessonId)
                {
                    Reject(key, "Soru ödevin dersine ait değil.");
                }
                else if (q.PublishedAt is not null)
                {
                    Reject(key, "Yayınlanmış soru ödeve eklenemez.");
                }
                else if (linked.Contains(q.Id))
                {
                    linkedConflict = true;
                    errors.Add(key, LinkedElsewhereMessage);
                }
                else if (answered.Contains(q.Id))
                {
                    Reject(key, "Cevaplanmış soru ödeve eklenemez.");
                }
                else if (!actor.IsMudur && q.Source != QuestionSource.Ai && q.AuthorUserId != actor.UserId)
                {
                    Reject(key, "Yalnızca kendi sorunuzu veya yapay zekâ sorusunu ekleyebilirsiniz.");
                }
            }

            if (errors.Any)
            {
                return linkedConflict && !otherErrors
                    ? Fail.Conflict(LinkedElsewhereMessage)
                    : errors.ToFailure("Soru seçimi geçersiz.");
            }

            var existing = await db.AssignmentQuestions
                .Where(aq => aq.AssignmentId == assignmentId)
                .GroupBy(aq => aq.AssignmentId)
                .Select(g => new { Count = g.Count(), MaxOrder = g.Max(x => x.OrderNo) })
                .FirstOrDefaultAsync(token);
            var existingCount = existing?.Count ?? 0;
            if (existingCount + questionIds.Count > AssignmentRules.MaxQuestionsPerAssignment)
            {
                return Fail.Conflict($"Bir ödeve en fazla {AssignmentRules.MaxQuestionsPerAssignment} soru eklenebilir.");
            }

            var startOrder = (existing?.MaxOrder ?? 0) + 1;
            db.AssignmentQuestions.AddRange(questionIds.Select((id, i) => new AssignmentQuestion
            {
                AssignmentId = assignmentId,
                QuestionId = id,
                OrderNo = startOrder + i,
                CreatedForAssignment = false
            }));
            try
            {
                await db.SaveChangesAsync(token);
            }
            catch (DbUpdateException ex) when (ex.IsUniqueViolation())
            {
                return Fail.Conflict(LinkedElsewhereMessage);
            }

            var versions = await db.Questions.AsNoTracking()
                .Where(q => questionIds.Contains(q.Id))
                .Select(q => new { q.Id, q.RowVersion })
                .ToDictionaryAsync(q => q.Id, q => q.RowVersion, token);
            var added = questionIds
                .Select((id, i) => new AddedQuestionView(id, startOrder + i, versions[id]))
                .ToList();
            return ServiceResult<AddedQuestionsView>.Ok(new AddedQuestionsView(added.Count, existingCount + added.Count, added));
        }, cancellationToken);
    }

    public Task<ServiceResult> RemoveAsync(Actor actor, int assignmentId, int questionId, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Task.FromResult<ServiceResult>(Fail.Forbidden("Yalnızca öğretmen veya müdür ödevden soru çıkarabilir."));
        }

        return db.ExecuteInTransactionAsync<ServiceResult>(async token =>
        {
            var assignment = await AssignmentGate.LockAsync(db, assignmentId, token);
            var gate = CheckEditable(actor, assignment);
            if (gate is Failure failure)
            {
                return failure;
            }

            var link = await db.AssignmentQuestions
                .Where(aq => aq.AssignmentId == assignmentId && aq.QuestionId == questionId)
                .Select(aq => new { aq.OrderNo, aq.CreatedForAssignment })
                .FirstOrDefaultAsync(token);
            if (link is null)
            {
                return Fail.NotFound("Soru bu ödevde bulunamadı.");
            }

            if (link.CreatedForAssignment)
            {
                var now = clock.UtcNow;
                await db.Questions
                    .Where(q => q.Id == questionId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(q => q.IsHidden, true)
                        .SetProperty(q => q.HiddenAt, now)
                        .SetProperty(q => q.HiddenByUserId, actor.UserId), token);
            }

            await db.AssignmentQuestions
                .Where(aq => aq.AssignmentId == assignmentId && aq.QuestionId == questionId)
                .ExecuteDeleteAsync(token);
            await db.AssignmentQuestions
                .Where(aq => aq.AssignmentId == assignmentId && aq.OrderNo > link.OrderNo)
                .ExecuteUpdateAsync(s => s.SetProperty(aq => aq.OrderNo, aq => aq.OrderNo - 1), token);

            return ServiceResult.Ok();
        }, cancellationToken);
    }

    public Task<ServiceResult> ReorderAsync(Actor actor, int assignmentId, IReadOnlyList<int> questionIds, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Task.FromResult<ServiceResult>(Fail.Forbidden("Yalnızca öğretmen veya müdür soru sırasını değiştirebilir."));
        }

        return db.ExecuteInTransactionAsync<ServiceResult>(async token =>
        {
            var assignment = await AssignmentGate.LockAsync(db, assignmentId, token);
            var gate = CheckEditable(actor, assignment);
            if (gate is Failure failure)
            {
                return failure;
            }

            var currentIds = await db.AssignmentQuestions.AsNoTracking()
                .Where(aq => aq.AssignmentId == assignmentId)
                .Select(aq => aq.QuestionId)
                .ToListAsync(token);
            if (questionIds.Distinct().Count() != questionIds.Count)
            {
                return Fail.Validation("Soru listesi ödevdeki sorularla birebir aynı olmalıdır.");
            }

            if (questionIds.Count != currentIds.Count || !currentIds.ToHashSet().SetEquals(questionIds))
            {
                return Fail.Conflict("Ödevdeki sorular değişmiş. Sayfayı yenileyip tekrar deneyin.");
            }

            const int offset = 100000;
            await db.AssignmentQuestions
                .Where(aq => aq.AssignmentId == assignmentId)
                .ExecuteUpdateAsync(s => s.SetProperty(aq => aq.OrderNo, aq => aq.OrderNo + offset), token);

            var rows = await db.AssignmentQuestions.Where(aq => aq.AssignmentId == assignmentId).ToListAsync(token);
            var position = questionIds.Select((id, i) => (id, i)).ToDictionary(x => x.id, x => x.i + 1);
            foreach (var row in rows)
            {
                row.OrderNo = position[row.QuestionId];
            }

            try
            {
                await db.SaveChangesAsync(token);
            }
            catch (DbUpdateException ex) when (ex.IsUniqueViolation())
            {
                return Fail.Conflict("Ödevdeki sorular değişmiş. Sayfayı yenileyip tekrar deneyin.");
            }

            return ServiceResult.Ok();
        }, cancellationToken);
    }

    public async Task<ServiceResult<AddedQuestionView>> UpdateAsync(Actor actor, int assignmentId, int questionId, UpdateAssignmentQuestionCommand command, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür soruyu değiştirebilir.");
        }

        if (command.RowVersion is null || command.RowVersion.Length == 0)
        {
            return Fail.Validation("Sürüm bilgisi zorunludur.");
        }

        return await db.ExecuteInTransactionAsync<ServiceResult<AddedQuestionView>>(async token =>
        {
            var assignment = await AssignmentGate.LockAsync(db, assignmentId, token);
            var gate = CheckEditable(actor, assignment);
            if (gate is Failure failure)
            {
                return failure;
            }

            var link = await db.AssignmentQuestions.AsNoTracking()
                .Where(aq => aq.AssignmentId == assignmentId && aq.QuestionId == questionId)
                .Select(aq => new { aq.OrderNo, aq.CreatedForAssignment })
                .FirstOrDefaultAsync(token);
            if (link is null)
            {
                return Fail.NotFound("Soru bu ödevde bulunamadı.");
            }

            var question = await db.Questions
                .FromSqlInterpolated($"SELECT * FROM [Questions] WITH (UPDLOCK, ROWLOCK) WHERE [Id] = {questionId}")
                .FirstOrDefaultAsync(token);
            if (question is null)
            {
                return Fail.NotFound("Soru bulunamadı.");
            }

            if (!question.RowVersion.AsSpan().SequenceEqual(command.RowVersion))
            {
                return Fail.Conflict("Soru başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
            }

            var contentTouched = command.Text is not null
                || command.ImageFileId is not null
                || command.OptionA is not null
                || command.OptionB is not null
                || command.OptionC is not null
                || command.OptionD is not null
                || command.TopicId is not null
                || command.Description is not null;
            if (!link.CreatedForAssignment && contentTouched)
            {
                return Fail.Conflict("Havuzdan eklenen sorunun yalnızca doğru şıkkı değiştirilebilir.");
            }

            if (!link.CreatedForAssignment && command.CorrectOption is byte pooledOption && pooledOption != question.CorrectOption)
            {
                var keyChange = await answerKeys.ApplyAsync(actor, questionId, new ChangeAnswerKeyCommand(pooledOption, command.RowVersion, null), true, token);
                if (!keyChange.Succeeded)
                {
                    return ServiceResult<AddedQuestionView>.From(keyChange);
                }

                return ServiceResult<AddedQuestionView>.Ok(new AddedQuestionView(question.Id, link.OrderNo, question.RowVersion));
            }

            var text = command.Text is null ? question.Text : AssignmentText.Clean(command.Text);
            var description = command.Description is null ? question.Description : AssignmentText.Clean(command.Description);
            int? imageId = command.ImageFileId switch
            {
                null => question.ImageFileId,
                <= 0 => null,
                var value => value
            };
            int? topicId = command.TopicId switch
            {
                null => question.TopicId,
                <= 0 => null,
                var value => value
            };
            string?[] options =
            [
                command.OptionA is null ? question.OptionA : AssignmentText.CleanSingleLine(command.OptionA),
                command.OptionB is null ? question.OptionB : AssignmentText.CleanSingleLine(command.OptionB),
                command.OptionC is null ? question.OptionC : AssignmentText.CleanSingleLine(command.OptionC),
                command.OptionD is null ? question.OptionD : AssignmentText.CleanSingleLine(command.OptionD)
            ];
            var correct = command.CorrectOption ?? question.CorrectOption;

            var errors = new ValidationErrors();
            ValidateShape(new ContentDraft(text, imageId, options, correct, description), string.Empty, errors);

            if (topicId is int topic && topic != question.TopicId)
            {
                var belongs = await db.Topics.AsNoTracking().AnyAsync(t => t.Id == topic && t.LessonId == question.LessonId, token);
                if (!belongs)
                {
                    errors.Add("topicId", "Konu bu derse ait değil.");
                }
            }

            if (imageId is int image && image != question.ImageFileId)
            {
                var imageErrors = await ValidateImagesAsync(actor, [image], "imageFileId", questionId, token);
                errors.Merge(imageErrors);
            }

            if (errors.Any)
            {
                return errors.ToFailure("Soru bilgileri geçersiz.");
            }

            question.Text = text;
            question.Description = description;
            question.ImageFileId = imageId;
            question.TopicId = topicId;
            question.OptionA = options[0];
            question.OptionB = options[1];
            question.OptionC = options[2];
            question.OptionD = options[3];
            question.CorrectOption = correct;

            try
            {
                await db.SaveChangesAsync(token);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Fail.Conflict("Soru başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
            }
            catch (DbUpdateException ex) when (ex.IsUniqueViolation())
            {
                return Fail.Conflict("Seçilen fotoğraf başka bir soruda kullanılıyor.");
            }

            return ServiceResult<AddedQuestionView>.Ok(new AddedQuestionView(question.Id, link.OrderNo, question.RowVersion));
        }, cancellationToken);
    }

    private Task<Failure?> AuthorizeBranchAsync(Actor actor, int lessonId, CancellationToken token) =>
        actor.IsTeacher
            ? AnswerKeyScope.AuthorizeAsync(db, actor, lessonId, token)
            : Task.FromResult<Failure?>(null);

    private Failure? CheckEditable(Actor actor, Assignment? assignment)
    {
        if (assignment is null)
        {
            return Fail.NotFound(AssignmentGate.NotFoundMessage);
        }

        if (!AssignmentGate.CanModify(actor, assignment.TeacherUserId))
        {
            return Fail.Forbidden("Yalnızca kendi ödevinizin sorularını değiştirebilirsiniz.");
        }

        var state = AssignmentState.Compute(assignment.Status, assignment.StartDate, assignment.EndDate, clock.Today);
        if (state is not (AssignmentEffectiveState.Draft or AssignmentEffectiveState.Scheduled))
        {
            return Fail.Conflict(NotEditableMessage);
        }

        return null;
    }

    private static void ValidateShape(ContentDraft draft, string prefix, ValidationErrors errors)
    {
        if (draft.CorrectOption is null or < 1 or > 4)
        {
            errors.Add($"{prefix}correctOption", "Doğru şık 1 ile 4 arasında olmalıdır.");
        }

        if (draft.Text is null && draft.ImageFileId is null)
        {
            errors.Add($"{prefix}text", "Soru metni veya fotoğrafı zorunludur.");
        }

        if (draft.Text is not null && draft.Text.Length > AssignmentRules.QuestionTextMaxLength)
        {
            errors.Add($"{prefix}text", $"Soru metni en fazla {AssignmentRules.QuestionTextMaxLength} karakter olabilir.");
        }

        if (draft.Description is not null && draft.Description.Length > AssignmentRules.QuestionDescriptionMaxLength)
        {
            errors.Add($"{prefix}description", $"Açıklama en fazla {AssignmentRules.QuestionDescriptionMaxLength} karakter olabilir.");
        }

        var names = new[] { "optionA", "optionB", "optionC", "optionD" };
        var provided = draft.Options.Count(o => o is not null);
        if (provided is > 0 and < 4)
        {
            var firstMissing = Array.FindIndex(draft.Options, o => o is null);
            errors.Add($"{prefix}{names[firstMissing]}", OptionsTogetherMessage);
        }

        for (var i = 0; i < draft.Options.Length; i++)
        {
            if (draft.Options[i] is { } option && option.Length > AssignmentRules.OptionMaxLength)
            {
                errors.Add($"{prefix}{names[i]}", $"Şık en fazla {AssignmentRules.OptionMaxLength} karakter olabilir.");
            }
        }
    }

    private async Task<ValidationErrors> ValidateImagesAsync(Actor actor, IReadOnlyList<int?> imageIds, string keyFormat, int? ownQuestionId, CancellationToken token)
    {
        var errors = new ValidationErrors();
        var problems = await fileValidator.ValidateAsync(actor.UserId, imageIds, AllowedPurposes, new StoredFileScope(OwnQuestionId: ownQuestionId), token);
        for (var i = 0; i < problems.Count; i++)
        {
            if (problems[i].MessageFor() is { } message)
            {
                errors.Add(string.Format(System.Globalization.CultureInfo.InvariantCulture, keyFormat, i), message);
            }
        }

        return errors;
    }
}
