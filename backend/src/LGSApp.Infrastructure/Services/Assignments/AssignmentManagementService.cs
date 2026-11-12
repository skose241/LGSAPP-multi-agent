using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Questions;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Assignments;

public sealed record CreateAssignmentCommand(int LessonId, string? Title, string? Description, DateOnly StartDate, DateOnly EndDate);

public sealed record UpdateAssignmentCommand(string? Title, string? Description, DateOnly? StartDate, DateOnly? EndDate, byte[]? RowVersion);

public sealed record AssignmentManageQuery(AssignmentEffectiveState? State, int? LessonId, bool MineOnly, int Page, int PageSize);

public enum AssignmentResultSort
{
    Completion = 1,
    Name = 2,
    Correct = 3,
    LastAnswered = 4
}

public sealed record AssignmentResultsQuery(AssignmentResultSort Sort, bool Descending, int Page, int PageSize);

public interface IAssignmentManagementService
{
    Task<ServiceResult<AssignmentManageDetailView>> CreateAsync(Actor actor, CreateAssignmentCommand command, CancellationToken cancellationToken = default);
    Task<ServiceResult<AssignmentManageDetailView>> UpdateAsync(Actor actor, int id, UpdateAssignmentCommand command, CancellationToken cancellationToken = default);
    Task<ServiceResult> DeleteAsync(Actor actor, int id, byte[]? rowVersion, CancellationToken cancellationToken = default);
    Task<ServiceResult<AssignmentManageListView>> ListAsync(Actor actor, AssignmentManageQuery query, CancellationToken cancellationToken = default);
    Task<ServiceResult<AssignmentManageDetailView>> GetAsync(Actor actor, int id, CancellationToken cancellationToken = default);
    Task<ServiceResult<AssignmentChangeView>> PublishAsync(Actor actor, int id, byte[]? rowVersion, CancellationToken cancellationToken = default);
    Task<ServiceResult<AssignmentChangeView>> UnpublishAsync(Actor actor, int id, byte[]? rowVersion, CancellationToken cancellationToken = default);
    Task<ServiceResult<AssignmentResultsView>> ResultsAsync(Actor actor, int id, AssignmentResultsQuery query, CancellationToken cancellationToken = default);
}

public sealed class AssignmentManagementService(
    AppDbContext db,
    UserLookupService users,
    IAssignmentNotifier notifier,
    IFileUrlService urls,
    TurkeyTime clock) : IAssignmentManagementService
{
    private const int MaxResultsPageSize = 100;

    private sealed class ResultRow
    {
        public int UserId { get; set; }
        public string? UserName { get; set; }
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public int Answered { get; set; }
        public int Correct { get; set; }
        public DateTime? Last { get; set; }
    }

    public async Task<ServiceResult<AssignmentManageDetailView>> CreateAsync(Actor actor, CreateAssignmentCommand command, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür ödev oluşturabilir.");
        }

        var lesson = await db.Lessons.AsNoTracking()
            .Where(l => l.Id == command.LessonId && l.IsActive)
            .Select(l => new LessonRefView(l.Id, l.Name))
            .FirstOrDefaultAsync(cancellationToken);
        if (lesson is null)
        {
            return Fail.Validation("Ders bulunamadı.");
        }

        var title = AssignmentText.CleanSingleLine(command.Title) ?? lesson.Name;
        if (title.Length > AssignmentRules.TitleMaxLength)
        {
            return Fail.Validation($"Başlık en fazla {AssignmentRules.TitleMaxLength} karakter olabilir.");
        }

        var description = AssignmentText.Clean(command.Description);
        if (description is not null && description.Length > AssignmentRules.DescriptionMaxLength)
        {
            return Fail.Validation($"Açıklama en fazla {AssignmentRules.DescriptionMaxLength} karakter olabilir.");
        }

        var dateFailure = AssignmentGate.ValidateDates(command.StartDate, command.EndDate, clock.Today, true);
        if (dateFailure is Failure failure)
        {
            return failure;
        }

        var assignment = new Assignment
        {
            TeacherUserId = actor.UserId,
            LessonId = lesson.Id,
            Title = title,
            Description = description,
            StartDate = command.StartDate,
            EndDate = command.EndDate,
            Status = AssignmentStatus.Draft,
            CreatedAt = clock.UtcNow
        };
        db.Assignments.Add(assignment);
        await db.SaveChangesAsync(cancellationToken);
        db.ChangeTracker.Clear();

        return await GetAsync(actor, assignment.Id, cancellationToken);
    }

    public async Task<ServiceResult<AssignmentManageDetailView>> UpdateAsync(Actor actor, int id, UpdateAssignmentCommand command, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür ödevi değiştirebilir.");
        }

        if (command.RowVersion is null || command.RowVersion.Length == 0)
        {
            return Fail.Validation("Sürüm bilgisi zorunludur.");
        }

        var result = await db.ExecuteInTransactionAsync<ServiceResult>(token => ApplyUpdateAsync(actor, id, command, token), cancellationToken);
        if (!result.Succeeded)
        {
            return ServiceResult<AssignmentManageDetailView>.From(result);
        }

        return await GetAsync(actor, id, cancellationToken);
    }

    private async Task<ServiceResult> ApplyUpdateAsync(Actor actor, int id, UpdateAssignmentCommand command, CancellationToken token)
    {
        var assignment = await AssignmentGate.LockAsync(db, id, token);
        if (assignment is null)
        {
            return Fail.NotFound(AssignmentGate.NotFoundMessage);
        }

        if (!AssignmentGate.CanModify(actor, assignment.TeacherUserId))
        {
            return Fail.Forbidden("Yalnızca kendi ödevinizi değiştirebilirsiniz.");
        }

        if (AssignmentGate.IsStale(assignment, command.RowVersion))
        {
            return Fail.Conflict(AssignmentGate.StaleMessage);
        }

        var today = clock.Today;
        var state = AssignmentState.Compute(assignment.Status, assignment.StartDate, assignment.EndDate, today);
        if (state == AssignmentEffectiveState.Closed)
        {
            return Fail.Conflict("Kapanmış ödev değiştirilemez.");
        }

        var start = assignment.StartDate;
        var end = assignment.EndDate;
        var datesChanged = false;

        if (command.StartDate is DateOnly newStart && newStart != assignment.StartDate)
        {
            if (state == AssignmentEffectiveState.Open)
            {
                return Fail.Conflict("Başlamış ödevin başlangıç tarihi değiştirilemez.");
            }

            if (newStart < today)
            {
                return Fail.Validation("Başlangıç tarihi bugünden önce olamaz.");
            }

            start = newStart;
            datesChanged = true;
        }

        if (command.EndDate is DateOnly newEnd && newEnd != assignment.EndDate)
        {
            if (state == AssignmentEffectiveState.Open && newEnd < today)
            {
                return Fail.Validation("Başlamış ödevin bitiş tarihi bugünden önceye alınamaz.");
            }

            end = newEnd;
            datesChanged = true;
        }

        if (datesChanged)
        {
            var dateFailure = AssignmentGate.ValidateDates(start, end, today, false);
            if (dateFailure is Failure failure)
            {
                return failure;
            }
        }

        if (command.Title is not null)
        {
            var title = AssignmentText.CleanSingleLine(command.Title);
            title ??= await db.Lessons.AsNoTracking().Where(l => l.Id == assignment.LessonId).Select(l => l.Name).FirstAsync(token);
            if (title.Length > AssignmentRules.TitleMaxLength)
            {
                return Fail.Validation($"Başlık en fazla {AssignmentRules.TitleMaxLength} karakter olabilir.");
            }

            assignment.Title = title;
        }

        if (command.Description is not null)
        {
            var description = AssignmentText.Clean(command.Description);
            if (description is not null && description.Length > AssignmentRules.DescriptionMaxLength)
            {
                return Fail.Validation($"Açıklama en fazla {AssignmentRules.DescriptionMaxLength} karakter olabilir.");
            }

            assignment.Description = description;
        }

        var now = clock.UtcNow;
        assignment.StartDate = start;
        assignment.EndDate = end;
        assignment.UpdatedAt = now;

        var opensNow = assignment.Status == AssignmentStatus.Scheduled
            && AssignmentState.Compute(assignment.Status, start, end, today) == AssignmentEffectiveState.Open;
        if (opensNow)
        {
            MarkOpened(assignment, now);
        }

        try
        {
            await db.SaveChangesAsync(token);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Fail.Conflict(AssignmentGate.StaleMessage);
        }

        if (opensNow)
        {
            await NotifyOpenedAsync(assignment, token);
        }

        return ServiceResult.Ok();
    }

    private static void MarkOpened(Assignment assignment, DateTime now)
    {
        assignment.Status = AssignmentStatus.Published;
        assignment.PublishedAt = now;
    }

    private Task<int> NotifyOpenedAsync(Assignment assignment, CancellationToken token) =>
        notifier.NotifyStudentsAsync(
            assignment.Id,
            NotificationType.AssignmentOpened,
            $"Yeni ödev açıldı: {assignment.Title}",
            token);

    public Task<ServiceResult> DeleteAsync(Actor actor, int id, byte[]? rowVersion, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Task.FromResult<ServiceResult>(Fail.Forbidden("Yalnızca öğretmen veya müdür ödevi silebilir."));
        }

        return db.ExecuteInTransactionAsync<ServiceResult>(async token =>
        {
            var assignment = await AssignmentGate.LockAsync(db, id, token);
            if (assignment is null)
            {
                return Fail.NotFound(AssignmentGate.NotFoundMessage);
            }

            if (!AssignmentGate.CanModify(actor, assignment.TeacherUserId))
            {
                return Fail.Forbidden("Yalnızca kendi ödevinizi silebilirsiniz.");
            }

            if (rowVersion is { Length: > 0 } && AssignmentGate.IsStale(assignment, rowVersion))
            {
                return Fail.Conflict(AssignmentGate.StaleMessage);
            }

            var state = AssignmentState.Compute(assignment.Status, assignment.StartDate, assignment.EndDate, clock.Today);
            if (state is not (AssignmentEffectiveState.Draft or AssignmentEffectiveState.Scheduled))
            {
                return Fail.Conflict("Başlamış veya kapanmış ödev silinemez.");
            }

            var now = clock.UtcNow;
            await db.Questions
                .Where(q => db.AssignmentQuestions.Any(aq => aq.AssignmentId == id && aq.QuestionId == q.Id && aq.CreatedForAssignment))
                .ExecuteUpdateAsync(s => s
                    .SetProperty(q => q.IsHidden, true)
                    .SetProperty(q => q.HiddenAt, now)
                    .SetProperty(q => q.HiddenByUserId, actor.UserId), token);
            await db.AssignmentQuestions
                .Where(aq => aq.AssignmentId == id && !aq.CreatedForAssignment)
                .ExecuteDeleteAsync(token);

            assignment.IsDeleted = true;
            assignment.UpdatedAt = now;

            try
            {
                await db.SaveChangesAsync(token);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Fail.Conflict(AssignmentGate.StaleMessage);
            }

            return ServiceResult.Ok();
        }, cancellationToken);
    }

    public async Task<ServiceResult<AssignmentManageListView>> ListAsync(Actor actor, AssignmentManageQuery query, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Bu listeyi yalnızca öğretmen veya müdür görebilir.");
        }

        if (query.Page < 1)
        {
            return Fail.Validation("Sayfa numarası 1 veya daha büyük olmalıdır.");
        }

        if (query.PageSize < 1 || query.PageSize > AssignmentRules.MaxPageSize)
        {
            return Fail.Validation($"Sayfa boyutu 1 ile {AssignmentRules.MaxPageSize} arasında olmalıdır.");
        }

        var today = clock.Today;
        var userId = actor.UserId;
        var countableQuestions = db.CountableQuestions();
        var countableAnswers = db.CountableAnswers();
        var source = db.Assignments.AsNoTracking().Where(a => !a.IsDeleted);
        if (query.State is AssignmentEffectiveState state)
        {
            source = source.WhereState(state, today);
        }

        if (query.LessonId is int lessonId)
        {
            source = source.Where(a => a.LessonId == lessonId);
        }

        if (query.MineOnly)
        {
            source = source.Where(a => a.TeacherUserId == userId);
        }

        var total = await source.CountAsync(cancellationToken);
        var offset = (long)(query.Page - 1) * query.PageSize;
        if (offset >= total)
        {
            return ServiceResult<AssignmentManageListView>.Ok(new AssignmentManageListView(query.Page, query.PageSize, total, []));
        }

        var rows = await source
            .OrderByDescending(a => a.StartDate)
            .ThenByDescending(a => a.Id)
            .Skip((int)offset)
            .Take(query.PageSize)
            .Select(a => new
            {
                a.Id,
                a.Title,
                a.Description,
                a.LessonId,
                LessonName = db.Lessons.Where(l => l.Id == a.LessonId).Select(l => l.Name).FirstOrDefault()!,
                a.TeacherUserId,
                a.StartDate,
                a.EndDate,
                a.Status,
                a.PublishedAt,
                a.ClosedAt,
                a.CreatedAt,
                a.RowVersion,
                QuestionCount = countableQuestions.Count(aq => aq.AssignmentId == a.Id),
                ParticipantCount = countableAnswers.Where(x => x.AssignmentId == a.Id).Select(x => x.UserId).Distinct().Count()
            })
            .ToListAsync(cancellationToken);

        var people = await users.GetAsync(rows.Select(r => r.TeacherUserId), true, cancellationToken);
        var items = rows.Select(r =>
        {
            people.TryGetValue(r.TeacherUserId, out var teacher);
            return new AssignmentManageItemView(
                r.Id,
                r.Title,
                r.Description,
                new LessonRefView(r.LessonId, r.LessonName),
                new AssignmentTeacherRefView(r.TeacherUserId, teacher?.UserName ?? string.Empty, teacher?.FullName),
                r.StartDate,
                r.EndDate,
                AssignmentState.Compute(r.Status, r.StartDate, r.EndDate, today),
                r.QuestionCount,
                r.ParticipantCount,
                r.PublishedAt,
                r.ClosedAt,
                r.CreatedAt,
                AssignmentGate.CanModify(actor, r.TeacherUserId),
                r.RowVersion);
        }).ToList();

        return ServiceResult<AssignmentManageListView>.Ok(new AssignmentManageListView(query.Page, query.PageSize, total, items));
    }

    public async Task<ServiceResult<AssignmentManageDetailView>> GetAsync(Actor actor, int id, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Bu ekranı yalnızca öğretmen veya müdür görebilir.");
        }

        var today = clock.Today;
        var countableAnswers = db.CountableAnswers();
        var head = await db.Assignments.AsNoTracking()
            .Where(a => a.Id == id && !a.IsDeleted)
            .Select(a => new
            {
                a.Id,
                a.Title,
                a.Description,
                a.LessonId,
                LessonName = db.Lessons.Where(l => l.Id == a.LessonId).Select(l => l.Name).FirstOrDefault()!,
                a.TeacherUserId,
                a.StartDate,
                a.EndDate,
                a.Status,
                a.PublishedAt,
                a.ClosedAt,
                a.CreatedAt,
                a.RowVersion,
                ParticipantCount = countableAnswers.Where(x => x.AssignmentId == a.Id).Select(x => x.UserId).Distinct().Count()
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (head is null)
        {
            return Fail.NotFound(AssignmentGate.NotFoundMessage);
        }

        var state = AssignmentState.Compute(head.Status, head.StartDate, head.EndDate, today);
        var canModify = AssignmentGate.CanModify(actor, head.TeacherUserId);
        var editable = canModify && state is AssignmentEffectiveState.Draft or AssignmentEffectiveState.Scheduled;

        var questionRows = await (
            from aq in db.AssignmentQuestions.AsNoTracking()
            where aq.AssignmentId == id
            join q in db.Questions.AsNoTracking() on aq.QuestionId equals q.Id
            orderby aq.OrderNo
            select new
            {
                q.Id,
                aq.OrderNo,
                q.Text,
                q.ImageFileId,
                q.OptionA,
                q.OptionB,
                q.OptionC,
                q.OptionD,
                q.CorrectOption,
                q.TopicId,
                TopicName = db.Topics.Where(t => t.Id == q.TopicId).Select(t => t.Name).FirstOrDefault(),
                q.Description,
                q.Source,
                aq.CreatedForAssignment,
                q.IsHidden,
                q.RowVersion
            }).ToListAsync(cancellationToken);

        var images = await urls.GetAsync(questionRows.Select(r => r.ImageFileId), cancellationToken);

        var distribution = await countableAnswers
            .Where(a => a.AssignmentId == id)
            .GroupBy(a => new { a.QuestionId, a.SelectedOption })
            .Select(g => new { g.Key.QuestionId, g.Key.SelectedOption, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var byQuestion = distribution.GroupBy(x => x.QuestionId).ToDictionary(g => g.Key, g => g.ToList());
        var people = await users.GetAsync([head.TeacherUserId], true, cancellationToken);
        people.TryGetValue(head.TeacherUserId, out var teacher);

        var questions = questionRows.Select(r =>
        {
            var counts = byQuestion.GetValueOrDefault(r.Id) ?? [];
            int Count(byte option) => counts.Where(c => c.SelectedOption == option).Sum(c => c.Count);
            var total = counts.Sum(c => c.Count);
            return new AssignmentQuestionManageView(
                r.Id,
                r.OrderNo,
                r.Text,
                r.ImageFileId,
                images.Find(r.ImageFileId),
                new QuestionOptionsView(r.OptionA, r.OptionB, r.OptionC, r.OptionD),
                r.CorrectOption,
                r.TopicId is int topicId && r.TopicName is not null ? new TopicRefView(topicId, r.TopicName) : null,
                r.Description,
                r.Source,
                r.CreatedForAssignment,
                r.IsHidden,
                editable,
                total,
                Count(r.CorrectOption),
                new OptionDistributionView(Count(1), Count(2), Count(3), Count(4)),
                r.RowVersion);
        }).ToList();

        return ServiceResult<AssignmentManageDetailView>.Ok(new AssignmentManageDetailView(
            head.Id,
            head.Title,
            head.Description,
            new LessonRefView(head.LessonId, head.LessonName),
            new AssignmentTeacherRefView(head.TeacherUserId, teacher?.UserName ?? string.Empty, teacher?.FullName),
            head.StartDate,
            head.EndDate,
            state,
            head.ParticipantCount,
            head.PublishedAt,
            head.ClosedAt,
            head.CreatedAt,
            canModify,
            head.RowVersion,
            questions));
    }

    public async Task<ServiceResult<AssignmentChangeView>> PublishAsync(Actor actor, int id, byte[]? rowVersion, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür ödevi yayınlayabilir.");
        }

        if (rowVersion is null || rowVersion.Length == 0)
        {
            return Fail.Validation("Sürüm bilgisi zorunludur.");
        }

        return await db.ExecuteInTransactionAsync<ServiceResult<AssignmentChangeView>>(async token =>
        {
            var assignment = await AssignmentGate.LockAsync(db, id, token);
            if (assignment is null)
            {
                return Fail.NotFound(AssignmentGate.NotFoundMessage);
            }

            if (!AssignmentGate.CanModify(actor, assignment.TeacherUserId))
            {
                return Fail.Forbidden("Yalnızca kendi ödevinizi yayınlayabilirsiniz.");
            }

            if (AssignmentGate.IsStale(assignment, rowVersion))
            {
                return Fail.Conflict(AssignmentGate.StaleMessage);
            }

            if (assignment.Status != AssignmentStatus.Draft)
            {
                return Fail.Conflict("Ödev zaten yayınlanmış.");
            }

            var questionCount = await db.CountableQuestions().CountAsync(aq => aq.AssignmentId == id, token);
            if (questionCount == 0)
            {
                return Fail.Validation("Yayınlamak için ödeve en az bir soru ekleyin.");
            }

            var today = clock.Today;
            if (assignment.StartDate < today)
            {
                return Fail.Conflict("Başlangıç tarihi geçmiş, tarihleri güncelleyin.");
            }

            var now = clock.UtcNow;
            var opensNow = assignment.StartDate == today;
            if (opensNow)
            {
                MarkOpened(assignment, now);
            }
            else
            {
                assignment.Status = AssignmentStatus.Scheduled;
            }

            assignment.UpdatedAt = now;

            try
            {
                await db.SaveChangesAsync(token);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Fail.Conflict(AssignmentGate.StaleMessage);
            }

            int? notified = null;
            if (opensNow)
            {
                notified = await NotifyOpenedAsync(assignment, token);
            }

            var state = AssignmentState.Compute(assignment.Status, assignment.StartDate, assignment.EndDate, today);
            return ServiceResult<AssignmentChangeView>.Ok(new AssignmentChangeView(assignment.Id, state, assignment.Status, assignment.PublishedAt, notified, assignment.RowVersion));
        }, cancellationToken);
    }

    public async Task<ServiceResult<AssignmentChangeView>> UnpublishAsync(Actor actor, int id, byte[]? rowVersion, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür yayını geri alabilir.");
        }

        if (rowVersion is null || rowVersion.Length == 0)
        {
            return Fail.Validation("Sürüm bilgisi zorunludur.");
        }

        return await db.ExecuteInTransactionAsync<ServiceResult<AssignmentChangeView>>(async token =>
        {
            var assignment = await AssignmentGate.LockAsync(db, id, token);
            if (assignment is null)
            {
                return Fail.NotFound(AssignmentGate.NotFoundMessage);
            }

            if (!AssignmentGate.CanModify(actor, assignment.TeacherUserId))
            {
                return Fail.Forbidden("Yalnızca kendi ödevinizin yayınını geri alabilirsiniz.");
            }

            if (AssignmentGate.IsStale(assignment, rowVersion))
            {
                return Fail.Conflict(AssignmentGate.StaleMessage);
            }

            var state = AssignmentState.Compute(assignment.Status, assignment.StartDate, assignment.EndDate, clock.Today);
            if (state != AssignmentEffectiveState.Scheduled)
            {
                return Fail.Conflict("Yalnızca henüz başlamamış planlı ödevlerin yayını geri alınabilir.");
            }

            assignment.Status = AssignmentStatus.Draft;
            assignment.PublishedAt = null;
            assignment.UpdatedAt = clock.UtcNow;

            try
            {
                await db.SaveChangesAsync(token);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Fail.Conflict(AssignmentGate.StaleMessage);
            }

            return ServiceResult<AssignmentChangeView>.Ok(new AssignmentChangeView(assignment.Id, AssignmentEffectiveState.Draft, assignment.Status, null, null, assignment.RowVersion));
        }, cancellationToken);
    }

    public async Task<ServiceResult<AssignmentResultsView>> ResultsAsync(Actor actor, int id, AssignmentResultsQuery query, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Sonuçları yalnızca öğretmen veya müdür görebilir.");
        }

        if (query.Page < 1)
        {
            return Fail.Validation("Sayfa numarası 1 veya daha büyük olmalıdır.");
        }

        if (query.PageSize < 1 || query.PageSize > MaxResultsPageSize)
        {
            return Fail.Validation($"Sayfa boyutu 1 ile {MaxResultsPageSize} arasında olmalıdır.");
        }

        var head = await db.Assignments.AsNoTracking()
            .Where(a => a.Id == id && !a.IsDeleted)
            .Select(a => new { a.Id, a.Title, a.Status, a.StartDate, a.EndDate })
            .FirstOrDefaultAsync(cancellationToken);
        if (head is null)
        {
            return Fail.NotFound(AssignmentGate.NotFoundMessage);
        }

        var questionRows = await (
            from aq in db.AssignmentQuestions.AsNoTracking()
            where aq.AssignmentId == id
            join q in db.Questions.AsNoTracking() on aq.QuestionId equals q.Id
            where !q.IsHidden
            orderby aq.OrderNo
            select new { q.Id, aq.OrderNo, q.CorrectOption }).ToListAsync(cancellationToken);
        var totalQuestions = questionRows.Count;

        var students = db.Users.AsNoTracking()
            .Where(u => !u.IsBanned && db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == Roles.OgrenciId));

        var rows = students.Select(u => new ResultRow
        {
            UserId = u.Id,
            UserName = u.UserName,
            FirstName = u.FirstName,
            LastName = u.LastName,
            Answered = (
                from an in db.Answers
                where an.AssignmentId == id && an.UserId == u.Id
                join q in db.Questions on an.QuestionId equals q.Id
                where !q.IsHidden
                select an.Id).Count(),
            Correct = (
                from an in db.Answers
                where an.AssignmentId == id && an.UserId == u.Id && an.IsCorrect
                join q in db.Questions on an.QuestionId equals q.Id
                where !q.IsHidden
                select an.Id).Count(),
            Last = (
                from an in db.Answers
                where an.AssignmentId == id && an.UserId == u.Id
                join q in db.Questions on an.QuestionId equals q.Id
                where !q.IsHidden
                select (DateTime?)an.AnsweredAt).Max()
        });

        var totalStudents = await students.CountAsync(cancellationToken);
        var participants = await db.CountableAnswers()
            .Where(an => an.AssignmentId == id)
            .Select(an => an.UserId)
            .Distinct()
            .CountAsync(cancellationToken);

        var desc = query.Descending;
        var ordered = query.Sort switch
        {
            AssignmentResultSort.Name => desc ? rows.OrderByDescending(r => r.UserName) : rows.OrderBy(r => r.UserName),
            AssignmentResultSort.Correct => desc ? rows.OrderByDescending(r => r.Correct) : rows.OrderBy(r => r.Correct),
            AssignmentResultSort.LastAnswered => desc ? rows.OrderByDescending(r => r.Last) : rows.OrderBy(r => r.Last),
            _ => desc ? rows.OrderByDescending(r => r.Answered) : rows.OrderBy(r => r.Answered)
        };

        var offset = (long)(query.Page - 1) * query.PageSize;
        var page = offset >= totalStudents
            ? new List<ResultRow>()
            : await ordered
                .ThenBy(r => r.UserName)
                .ThenBy(r => r.UserId)
                .Skip((int)offset)
                .Take(query.PageSize)
                .ToListAsync(cancellationToken);

        var studentViews = page.Select(r => new AssignmentStudentRowView(
            r.UserId,
            r.UserName ?? string.Empty,
            $"{r.FirstName} {r.LastName}".Trim(),
            r.Answered,
            r.Correct,
            totalQuestions,
            totalQuestions == 0 ? 0 : Math.Round((double)r.Answered / totalQuestions, 4),
            r.Last)).ToList();

        var distribution = await db.CountableAnswers()
            .Where(an => an.AssignmentId == id)
            .GroupBy(an => new { an.QuestionId, an.SelectedOption })
            .Select(g => new { g.Key.QuestionId, g.Key.SelectedOption, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var byQuestion = distribution.GroupBy(x => x.QuestionId).ToDictionary(g => g.Key, g => g.ToList());

        var questionViews = questionRows.Select(q =>
        {
            var counts = byQuestion.GetValueOrDefault(q.Id) ?? [];
            int Count(byte option) => counts.Where(c => c.SelectedOption == option).Sum(c => c.Count);
            var total = counts.Sum(c => c.Count);
            var correct = Count(q.CorrectOption);
            return new AssignmentQuestionResultView(
                q.Id,
                q.OrderNo,
                q.CorrectOption,
                total,
                correct,
                total == 0 ? 0 : Math.Round((double)correct / total, 4),
                new OptionDistributionView(Count(1), Count(2), Count(3), Count(4)));
        }).ToList();

        return ServiceResult<AssignmentResultsView>.Ok(new AssignmentResultsView(
            head.Id,
            head.Title,
            AssignmentState.Compute(head.Status, head.StartDate, head.EndDate, clock.Today),
            totalQuestions,
            totalStudents,
            participants,
            query.Page,
            query.PageSize,
            studentViews,
            questionViews));
    }
}
