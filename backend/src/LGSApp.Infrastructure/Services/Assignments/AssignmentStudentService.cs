using LGSApp.Domain.Constants;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Files;
using LGSApp.Infrastructure.Services.Questions;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Assignments;

public interface IAssignmentStudentService
{
    Task<ServiceResult<AssignmentStudentListView>> ListAsync(Actor actor, AssignmentEffectiveState state, int? lessonId, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<ServiceResult<AssignmentStudentDetailView>> GetAsync(Actor actor, int id, CancellationToken cancellationToken = default);
}

public sealed class AssignmentStudentService(AppDbContext db, TurkeyTime clock, IFileUrlService urls) : IAssignmentStudentService
{
    public async Task<ServiceResult<AssignmentStudentListView>> ListAsync(Actor actor, AssignmentEffectiveState state, int? lessonId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        if (state is not (AssignmentEffectiveState.Open or AssignmentEffectiveState.Closed))
        {
            return Fail.Validation("Durum 'open' veya 'closed' olmalıdır.");
        }

        if (page < 1)
        {
            return Fail.Validation("Sayfa numarası 1 veya daha büyük olmalıdır.");
        }

        if (pageSize < 1 || pageSize > AssignmentRules.MaxPageSize)
        {
            return Fail.Validation($"Sayfa boyutu 1 ile {AssignmentRules.MaxPageSize} arasında olmalıdır.");
        }

        var today = clock.Today;
        var userId = actor.UserId;
        var source = db.Assignments.AsNoTracking().Where(a => !a.IsDeleted).WhereState(state, today);
        if (lessonId is int lesson)
        {
            source = source.Where(a => a.LessonId == lesson);
        }

        var total = await source.CountAsync(cancellationToken);
        var offset = (long)(page - 1) * pageSize;
        if (offset >= total)
        {
            return ServiceResult<AssignmentStudentListView>.Ok(new AssignmentStudentListView(page, pageSize, total, []));
        }

        var ordered = state == AssignmentEffectiveState.Open
            ? source.OrderBy(a => a.EndDate).ThenBy(a => a.Id)
            : source.OrderByDescending(a => a.EndDate).ThenByDescending(a => a.Id);

        var rows = await ordered
            .Skip((int)offset)
            .Take(pageSize)
            .Select(a => new
            {
                a.Id,
                a.Title,
                a.LessonId,
                LessonName = db.Lessons.Where(l => l.Id == a.LessonId).Select(l => l.Name).FirstOrDefault()!,
                TeacherUserName = db.Users.Where(u => u.Id == a.TeacherUserId).Select(u => u.UserName).FirstOrDefault(),
                a.StartDate,
                a.EndDate,
                a.Status,
                TotalQuestions = (
                    from aq in db.AssignmentQuestions
                    where aq.AssignmentId == a.Id
                    join q in db.Questions on aq.QuestionId equals q.Id
                    where !q.IsHidden
                    select aq.QuestionId).Count(),
                MyAnswered = (
                    from an in db.Answers
                    where an.AssignmentId == a.Id && an.UserId == userId
                    join q in db.Questions on an.QuestionId equals q.Id
                    where !q.IsHidden
                    select an.Id).Count(),
                MyCorrect = (
                    from an in db.Answers
                    where an.AssignmentId == a.Id && an.UserId == userId && an.IsCorrect
                    join q in db.Questions on an.QuestionId equals q.Id
                    where !q.IsHidden
                    select an.Id).Count()
            })
            .ToListAsync(cancellationToken);

        var items = rows.Select(r => new AssignmentStudentListItemView(
            r.Id,
            r.Title,
            new LessonRefView(r.LessonId, r.LessonName),
            r.TeacherUserName ?? string.Empty,
            r.StartDate,
            r.EndDate,
            AssignmentState.Compute(r.Status, r.StartDate, r.EndDate, today),
            r.TotalQuestions,
            r.MyAnswered,
            r.MyCorrect)).ToList();

        return ServiceResult<AssignmentStudentListView>.Ok(new AssignmentStudentListView(page, pageSize, total, items));
    }

    public async Task<ServiceResult<AssignmentStudentDetailView>> GetAsync(Actor actor, int id, CancellationToken cancellationToken = default)
    {
        var today = clock.Today;
        var userId = actor.UserId;
        var head = await db.Assignments.AsNoTracking()
            .Where(a => a.Id == id && !a.IsDeleted)
            .Select(a => new
            {
                a.Id,
                a.Title,
                a.Description,
                a.LessonId,
                LessonName = db.Lessons.Where(l => l.Id == a.LessonId).Select(l => l.Name).FirstOrDefault()!,
                TeacherUserName = db.Users.Where(u => u.Id == a.TeacherUserId).Select(u => u.UserName).FirstOrDefault(),
                a.StartDate,
                a.EndDate,
                a.Status
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (head is null)
        {
            return Fail.NotFound(AssignmentGate.NotFoundMessage);
        }

        var state = AssignmentState.Compute(head.Status, head.StartDate, head.EndDate, today);
        if (state is not (AssignmentEffectiveState.Open or AssignmentEffectiveState.Closed))
        {
            return Fail.NotFound(AssignmentGate.NotFoundMessage);
        }

        var questionRows = await (
            from aq in db.AssignmentQuestions.AsNoTracking()
            where aq.AssignmentId == id
            join q in db.Questions.AsNoTracking() on aq.QuestionId equals q.Id
            where !q.IsHidden
            orderby aq.OrderNo
            select new { q.Id, aq.OrderNo, q.Text, q.ImageFileId, q.OptionA, q.OptionB, q.OptionC, q.OptionD, q.CorrectOption }).ToListAsync(cancellationToken);

        var images = await urls.GetAsync(questionRows.Select(r => r.ImageFileId), cancellationToken);

        var mine = await db.Answers.AsNoTracking()
            .Where(a => a.AssignmentId == id && a.UserId == userId)
            .Select(a => new { a.QuestionId, a.SelectedOption, a.IsCorrect, a.AnsweredAt })
            .ToDictionaryAsync(a => a.QuestionId, cancellationToken);

        var isClosed = state == AssignmentEffectiveState.Closed;
        var questions = questionRows.Select(r =>
        {
            mine.TryGetValue(r.Id, out var answer);
            var answered = answer is not null;
            var revealKey = actor.IsModerator || isClosed || answered;
            return new AssignmentStudentQuestionView(
                r.Id,
                r.OrderNo,
                r.Text,
                r.ImageFileId,
                images.Find(r.ImageFileId),
                new QuestionOptionsView(r.OptionA, r.OptionB, r.OptionC, r.OptionD),
                answer is null ? null : new AssignmentMyAnswerView(answer.SelectedOption, answer.IsCorrect, r.CorrectOption, answer.AnsweredAt),
                revealKey ? r.CorrectOption : null,
                actor.IsStudent && state == AssignmentEffectiveState.Open && !answered,
                actor.IsModerator || isClosed);
        }).ToList();

        var visibleIds = questionRows.Select(q => q.Id).ToHashSet();
        var myVisible = mine.Where(m => visibleIds.Contains(m.Key)).Select(m => m.Value).ToList();

        return ServiceResult<AssignmentStudentDetailView>.Ok(new AssignmentStudentDetailView(
            head.Id,
            head.Title,
            head.Description,
            new LessonRefView(head.LessonId, head.LessonName),
            head.TeacherUserName ?? string.Empty,
            head.StartDate,
            head.EndDate,
            state,
            questions.Count,
            myVisible.Count,
            myVisible.Count(a => a.IsCorrect),
            questions));
    }
}
