using System.Globalization;
using System.Text.Json;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Ai;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Notifications;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Questions;

public sealed record ChangeAnswerKeyCommand(byte CorrectOption, byte[]? RowVersion, string? Note);

public sealed record AnswerKeyChangeView(byte CorrectOption, int AffectedAnswerCount, int BecameCorrect, int BecameIncorrect, byte[] RowVersion);

public interface IAnswerKeyService
{
    Task<ServiceResult<AnswerKeyChangeView>> ChangeAsync(Actor actor, int questionId, ChangeAnswerKeyCommand command, CancellationToken cancellationToken = default);
    Task<ServiceResult<AnswerKeyChangeView>> ApplyAsync(Actor actor, int questionId, ChangeAnswerKeyCommand command, bool closeWrongAnswerKeyReports, CancellationToken cancellationToken = default);
}

public sealed class AnswerKeyService(
    AppDbContext db,
    ISettingsService settings,
    INotificationService notifications,
    TurkeyTime clock) : IAnswerKeyService
{
    public async Task<ServiceResult<AnswerKeyChangeView>> ChangeAsync(Actor actor, int questionId, ChangeAnswerKeyCommand command, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür doğru cevabı değiştirebilir.");
        }

        if (command.CorrectOption is < 1 or > 4)
        {
            return Fail.Validation("Doğru şık 1 ile 4 arasında olmalıdır.");
        }

        if (command.RowVersion is null || command.RowVersion.Length == 0)
        {
            return Fail.Validation("Sürüm bilgisi zorunludur.");
        }

        var invalidNote = AnswerKeyReviewNote.TryPrepare(command.Note, out var note);
        if (invalidNote is { } noteFailure)
        {
            return noteFailure;
        }

        var normalized = command with { Note = note };
        return await db.ExecuteInTransactionAsync<ServiceResult<AnswerKeyChangeView>>(
            token => ApplyAsync(actor, questionId, normalized, true, token),
            cancellationToken);
    }

    public async Task<ServiceResult<AnswerKeyChangeView>> ApplyAsync(Actor actor, int questionId, ChangeAnswerKeyCommand command, bool closeWrongAnswerKeyReports, CancellationToken cancellationToken = default)
    {
        if (db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException("Cevap anahtarı düzeltmesi yalnızca açık bir veritabanı işlemi içinde yapılabilir.");
        }

        var newOption = command.CorrectOption;
        if (newOption is < 1 or > 4)
        {
            return Fail.Validation("Doğru şık 1 ile 4 arasında olmalıdır.");
        }

        var question = await db.Questions
            .FromSqlInterpolated($"SELECT * FROM [Questions] WITH (UPDLOCK, ROWLOCK) WHERE [Id] = {questionId}")
            .FirstOrDefaultAsync(cancellationToken);
        if (question is null)
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        var denied = await AnswerKeyScope.AuthorizeAsync(db, actor, question.LessonId, cancellationToken);
        if (denied is { } scopeFailure)
        {
            return scopeFailure;
        }

        if (command.RowVersion is not null && !question.RowVersion.AsSpan().SequenceEqual(command.RowVersion))
        {
            return Fail.Conflict("Soru başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }

        if (question.CorrectOption == newOption)
        {
            return Fail.Validation("Seçilen şık zaten doğru cevap olarak işaretli.");
        }

        var correctPoints = await settings.GetIntAsync(SettingKeys.PuanDogruCevap, cancellationToken);
        var now = clock.UtcNow;
        var today = TurkeyTime.ToLocalDate(now);

        var answers = await db.Answers.AsNoTracking()
            .Where(a => a.QuestionId == questionId)
            .Select(a => new { a.Id, a.UserId, a.AssignmentId, a.SelectedOption, a.IsCorrect })
            .ToListAsync(cancellationToken);

        var ledgerRows = await db.PointTransactions.AsNoTracking()
            .Where(p => p.QuestionId == questionId
                && p.AnswerId != null
                && (p.Reason == PointReason.CorrectAnswer || p.Reason == PointReason.AnswerKeyCorrection))
            .Select(p => new { AnswerId = p.AnswerId!.Value, p.Reason, p.Amount, p.Id })
            .ToListAsync(cancellationToken);

        var net = new Dictionary<int, int>();
        var firstCorrect = new Dictionary<int, (long Id, int Amount)>();
        foreach (var row in ledgerRows)
        {
            net[row.AnswerId] = net.GetValueOrDefault(row.AnswerId) + row.Amount;
            if (row.Reason == PointReason.CorrectAnswer
                && (!firstCorrect.TryGetValue(row.AnswerId, out var known) || row.Id < known.Id))
            {
                firstCorrect[row.AnswerId] = (row.Id, row.Amount);
            }
        }

        var corrections = new List<PointTransaction>();
        var userDeltas = new Dictionary<int, int>();
        var diffByAnswer = new Dictionary<int, int>();
        var becameCorrect = new List<(int UserId, int AnswerId, int? AssignmentId)>();
        var becameIncorrect = new List<(int UserId, int AnswerId, int? AssignmentId)>();

        foreach (var answer in answers)
        {
            var nowCorrect = answer.SelectedOption == newOption;
            var target = nowCorrect
                ? (firstCorrect.TryGetValue(answer.Id, out var first) ? first.Amount : correctPoints)
                : 0;
            var diff = target - net.GetValueOrDefault(answer.Id);

            if (diff != 0)
            {
                corrections.Add(new PointTransaction
                {
                    UserId = answer.UserId,
                    Amount = diff,
                    Reason = PointReason.AnswerKeyCorrection,
                    QuestionId = questionId,
                    AnswerId = answer.Id,
                    AssignmentId = answer.AssignmentId,
                    LocalDate = today,
                    CreatedAt = now,
                    CreatedByUserId = actor.UserId
                });
                userDeltas[answer.UserId] = userDeltas.GetValueOrDefault(answer.UserId) + diff;
                diffByAnswer[answer.Id] = diff;
            }

            if (!answer.IsCorrect && nowCorrect)
            {
                becameCorrect.Add((answer.UserId, answer.Id, answer.AssignmentId));
            }
            else if (answer.IsCorrect && !nowCorrect)
            {
                becameIncorrect.Add((answer.UserId, answer.Id, answer.AssignmentId));
            }
        }

        await db.Answers
            .Where(a => a.QuestionId == questionId && a.SelectedOption == newOption && !a.IsCorrect)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.IsCorrect, true), cancellationToken);
        await db.Answers
            .Where(a => a.QuestionId == questionId && a.SelectedOption != newOption && a.IsCorrect)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.IsCorrect, false), cancellationToken);

        question.CorrectOption = newOption;
        question.CorrectOptionChangedAt = now;
        question.CorrectOptionChangedByUserId = actor.UserId;
        var wasDisputed = question.IsAnswerDisputed;
        question.IsAnswerDisputed = false;
        question.AnswerDisputedAt = null;
        question.AiSuggestedOption = null;
        question.AnswerKeyReviewedAt = now;
        question.AnswerKeyReviewedByUserId = actor.UserId;
        question.AnswerKeyReviewNote = command.Note;

        var aiSolution = await db.Solutions
            .FirstOrDefaultAsync(s => s.QuestionId == questionId && s.Type == SolutionType.Ai && !s.IsDeleted, cancellationToken);
        if (aiSolution is not null)
        {
            AnswerKeyAiSolutionRules.Apply(aiSolution, newOption, wasDisputed, now);
        }

        db.PointTransactions.AddRange(corrections);
        await ApplyUserDeltasAsync(userDeltas, cancellationToken);

        var aiIds = (await db.UserRoles
            .Where(ur => ur.RoleId == Roles.AiId)
            .Select(ur => ur.UserId)
            .ToListAsync(cancellationToken)).ToHashSet();

        foreach (var item in becameCorrect.Where(x => !aiIds.Contains(x.UserId)))
        {
            db.Notifications.Add(BuildNotification(item.UserId, questionId, item.AssignmentId, true, diffByAnswer.GetValueOrDefault(item.AnswerId), now));
        }

        foreach (var item in becameIncorrect.Where(x => !aiIds.Contains(x.UserId)))
        {
            db.Notifications.Add(BuildNotification(item.UserId, questionId, item.AssignmentId, false, diffByAnswer.GetValueOrDefault(item.AnswerId), now));
        }

        if (closeWrongAnswerKeyReports)
        {
            var pending = await db.Reports
                .Where(r => r.Status == ReportStatus.Pending
                    && r.TargetType == ReportTargetType.Question
                    && r.QuestionId == questionId
                    && r.Reason == ReportReason.WrongAnswerKey)
                .ToListAsync(cancellationToken);

            foreach (var report in pending)
            {
                report.Status = ReportStatus.Resolved;
                report.ActionTaken = ReportAction.AnswerKeyChanged;
                report.ResolvedByUserId = actor.UserId;
                report.ResolvedAt = now;
                report.ResolutionNote = command.Note;

                await notifications.NotifyAsync(
                    new NotificationDraft(
                        report.ReporterUserId,
                        NotificationType.ReportResolved,
                        "Şikayetiniz incelendi ve sorunun doğru cevabı düzeltildi.",
                        QuestionId: questionId,
                        SenderUserId: actor.UserId),
                    false,
                    cancellationToken);
            }
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Fail.Conflict("Kayıt başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }

        return ServiceResult<AnswerKeyChangeView>.Ok(new AnswerKeyChangeView(
            newOption,
            becameCorrect.Count + becameIncorrect.Count,
            becameCorrect.Count,
            becameIncorrect.Count,
            question.RowVersion));
    }

    private async Task ApplyUserDeltasAsync(Dictionary<int, int> userDeltas, CancellationToken cancellationToken)
    {
        var changes = userDeltas.Where(x => x.Value != 0).Select(x => new { u = x.Key, d = x.Value }).ToList();
        if (changes.Count == 0)
        {
            return;
        }

        var table = db.Model.FindEntityType(typeof(ApplicationUser))!.GetTableName()!;
        var json = JsonSerializer.Serialize(changes);
        var sql = $"UPDATE t SET t.[Points] = t.[Points] + j.[d] FROM [{table}] AS t INNER JOIN OPENJSON({{0}}) WITH ([u] int '$.u', [d] int '$.d') AS j ON j.[u] = t.[Id]";
        await db.Database.ExecuteSqlRawAsync(sql, [json], cancellationToken);
    }

    private static Notification BuildNotification(int userId, int questionId, int? assignmentId, bool correct, int diff, DateTime now)
    {
        var message = correct
            ? "Bir sorunun doğru cevabı düzeltildi; cevabınız artık doğru sayılıyor."
            : "Bir sorunun doğru cevabı düzeltildi; cevabınız artık yanlış sayılıyor.";
        if (diff != 0)
        {
            message += $" Puan farkı: {diff.ToString("+0;-0", CultureInfo.InvariantCulture)}.";
        }

        return new Notification
        {
            UserId = userId,
            Type = NotificationType.AnswerKeyChanged,
            Message = message,
            QuestionId = questionId,
            AssignmentId = assignmentId,
            CreatedAt = now
        };
    }
}
