using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Notifications;
using LGSApp.Infrastructure.Services.Points;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Answers;

public sealed record SubmitAnswerCommand(byte SelectedOption, string? SolutionText, int? SolutionImageFileId);

public sealed record AnswerResultView(bool IsCorrect, byte CorrectOption, int PointsEarned, int SolutionId);

public interface IAnswerService
{
    Task<ServiceResult<AnswerResultView>> SubmitAsync(Actor actor, int questionId, SubmitAnswerCommand command, CancellationToken cancellationToken = default);
}

public sealed class AnswerService(
    AppDbContext db,
    ISettingsService settings,
    IQuestionAccessService access,
    IPointService points,
    INotificationService notifications,
    UserLookupService users,
    TurkeyTime clock) : IAnswerService
{
    public async Task<ServiceResult<AnswerResultView>> SubmitAsync(Actor actor, int questionId, SubmitAnswerCommand command, CancellationToken cancellationToken = default)
    {
        if (!actor.IsStudent)
        {
            return Fail.Forbidden("Yalnızca öğrenciler soru cevaplayabilir.");
        }

        if (command.SelectedOption is < 1 or > 4)
        {
            return Fail.Validation("Seçenek 1 ile 4 arasında olmalıdır.");
        }

        var minLength = await settings.GetIntAsync(SettingKeys.AciklamaMinKarakter, cancellationToken);
        var maxLength = await settings.GetIntAsync(SettingKeys.CozumMaxKarakter, cancellationToken);
        var correctPoints = await settings.GetIntAsync(SettingKeys.PuanDogruCevap, cancellationToken);
        var solutionPoints = await settings.GetIntAsync(SettingKeys.PuanCozumYazma, cancellationToken);

        var text = string.IsNullOrWhiteSpace(command.SolutionText) ? null : command.SolutionText.Trim();
        var imageId = command.SolutionImageFileId;

        if (text is null && imageId is null)
        {
            return Fail.Validation("Çözüm açıklaması zorunludur. Metin yazın veya fotoğraf ekleyin.");
        }

        if (text is not null && text.Length > maxLength)
        {
            return Fail.Validation($"Çözüm açıklaması en fazla {maxLength} karakter olabilir.");
        }

        if (text is not null && imageId is null && text.Length < minLength)
        {
            return Fail.Validation($"Çözüm açıklaması en az {minLength} karakter olmalıdır.");
        }

        try
        {
            return await db.ExecuteInTransactionAsync<ServiceResult<AnswerResultView>>(
                token => ExecuteAsync(actor, questionId, command.SelectedOption, text, imageId, correctPoints, solutionPoints, token),
                cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation())
        {
            return Fail.Conflict("Bu soruyu zaten cevapladınız.");
        }
    }

    private async Task<ServiceResult<AnswerResultView>> ExecuteAsync(
        Actor actor,
        int questionId,
        byte selectedOption,
        string? text,
        int? imageId,
        int correctPoints,
        int solutionPoints,
        CancellationToken token)
    {
        var locked = await db.Questions
            .FromSqlInterpolated($"SELECT * FROM [Questions] WITH (UPDLOCK, ROWLOCK) WHERE [Id] = {questionId}")
            .AsNoTracking()
            .Select(q => new { q.CorrectOption, q.AuthorUserId, q.Source })
            .FirstOrDefaultAsync(token);

        if (locked is null)
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        var decision = await access.GetAsync(questionId, actor, token);
        if (decision is null || !decision.IsVisible)
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        if (decision.Facts.AssignmentStatus is not null)
        {
            return Fail.Conflict("Bu soru bir ödeve aittir. Ödev sorularını ödev ekranından cevaplayabilirsiniz.");
        }

        if (decision.Facts.PublishedAt is null || decision.Facts.IsHidden)
        {
            return Fail.NotFound("Soru bulunamadı.");
        }

        if (decision.IsOwner)
        {
            return Fail.Forbidden("Kendi sorunuzu cevaplayamazsınız.");
        }

        if (decision.Facts.HasAnswered)
        {
            return Fail.Conflict("Bu soruyu zaten cevapladınız.");
        }

        if (imageId is int fileId)
        {
            var file = await db.StoredFiles.AsNoTracking()
                .Where(f => f.Id == fileId)
                .Select(f => new { f.UploadedByUserId, f.Status, f.Purpose })
                .FirstOrDefaultAsync(token);

            if (file is null
                || file.UploadedByUserId != actor.UserId
                || file.Status != FileStatus.Ready
                || file.Purpose != FilePurpose.SolutionImage)
            {
                return Fail.Validation("Seçilen fotoğraf geçersiz veya henüz hazır değil.");
            }

            var used = await db.Solutions.AnyAsync(s => s.ImageFileId == fileId, token)
                || await db.Questions.AnyAsync(q => q.ImageFileId == fileId, token);
            if (used)
            {
                return Fail.Validation("Seçilen fotoğraf daha önce kullanılmış.");
            }
        }

        var now = clock.UtcNow;
        var isCorrect = selectedOption == locked.CorrectOption;

        var answer = new Answer
        {
            QuestionId = questionId,
            UserId = actor.UserId,
            SelectedOption = selectedOption,
            IsCorrect = isCorrect,
            AnsweredAt = now
        };
        db.Answers.Add(answer);
        await db.SaveChangesAsync(token);

        var solution = new Solution
        {
            QuestionId = questionId,
            AuthorUserId = actor.UserId,
            Type = SolutionType.Student,
            AnswerId = answer.Id,
            Text = text,
            ImageFileId = imageId,
            CreatedAt = now
        };
        db.Solutions.Add(solution);

        var earned = await points.AwardAsync(actor.UserId, solutionPoints, PointReason.SolutionWritten, questionId, answer.Id, null, null, token);
        if (isCorrect)
        {
            earned += await points.AwardAsync(actor.UserId, correctPoints, PointReason.CorrectAnswer, questionId, answer.Id, null, null, token);
        }

        if (locked.Source != QuestionSource.Ai && locked.AuthorUserId != actor.UserId)
        {
            var people = await users.GetAsync([actor.UserId], false, token);
            var name = people.TryGetValue(actor.UserId, out var me) ? me.UserName : "Bir öğrenci";
            await notifications.NotifyAsync(
                new NotificationDraft(
                    locked.AuthorUserId,
                    NotificationType.StudentSolution,
                    $"{name} sorunuza çözüm ekledi.",
                    QuestionId: questionId,
                    SenderUserId: actor.UserId),
                false,
                token);
        }

        await db.SaveChangesAsync(token);

        return ServiceResult<AnswerResultView>.Ok(new AnswerResultView(isCorrect, locked.CorrectOption, earned, solution.Id));
    }
}
