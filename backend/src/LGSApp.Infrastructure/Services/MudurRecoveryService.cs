using System.Globalization;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Common;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services;

public sealed record RecoverOutcome(bool Succeeded, int RemainingCodes);

public sealed record OperatorResetOutcome(bool Succeeded, string Message, string? Password, bool IsBanned);

public class MudurRecoveryService(
    AppDbContext db,
    UserManager<ApplicationUser> userManager,
    RecoveryCodeService codes,
    OneTimePasswordService oneTimePasswords)
{
    public async Task<IdentityResult?> ValidateNewPasswordAsync(string password)
    {
        if (password.Length < MudurRules.PasswordMinLength)
        {
            return IdentityResult.Failed(new TurkishIdentityErrorDescriber().MudurPasswordTooShort());
        }

        var probe = new ApplicationUser { UserName = "kurtarma-dogrulama" };
        var errors = new List<IdentityError>();
        foreach (var validator in userManager.PasswordValidators)
        {
            var result = await validator.ValidateAsync(userManager, probe, password);
            if (!result.Succeeded)
            {
                errors.AddRange(result.Errors);
            }
        }

        return errors.Count == 0 ? null : IdentityResult.Failed(errors.ToArray());
    }

    public async Task<RecoverOutcome> RecoverAsync(string userName, string recoveryCode, string newPassword, CancellationToken cancellationToken = default)
    {
        var user = await userManager.FindByNameAsync(userName.Trim());
        var eligible = user is not null
            && !user.IsBanned
            && user.PasswordHash is not null
            && await userManager.IsInRoleAsync(user, Roles.Mudur)
            && !await userManager.IsInRoleAsync(user, Roles.Ai);
        if (!eligible)
        {
            await codes.FindMatchAsync(user?.Id ?? 0, recoveryCode, cancellationToken);
            await PadWriteAsync(cancellationToken);
            return new RecoverOutcome(false, 0);
        }

        var userId = user!.Id;
        var codeId = await codes.FindMatchAsync(userId, recoveryCode, cancellationToken);
        if (codeId is null)
        {
            await PadWriteAsync(cancellationToken);
            return new RecoverOutcome(false, 0);
        }

        var outcome = await db.ExecuteInTransactionAsync<ServiceResult>(async token =>
        {
            if (!await codes.ConsumeAsync(codeId.Value, token))
            {
                return Fail.Conflict("Kurtarma kodu kullanılamadı.");
            }

            var target = await userManager.FindByIdAsync(userId.ToString(CultureInfo.InvariantCulture));
            if (target is null)
            {
                return Fail.NotFound("Kullanıcı bulunamadı.");
            }

            target.MustChangePassword = false;
            var resetToken = await userManager.GeneratePasswordResetTokenAsync(target);
            var result = await userManager.ResetPasswordAsync(target, resetToken, newPassword);
            if (!result.Succeeded)
            {
                return Fail.Validation("Şifre geçersiz.");
            }

            result = await userManager.UpdateSecurityStampAsync(target);
            if (!result.Succeeded)
            {
                return Fail.Validation("Şifre geçersiz.");
            }

            await userManager.SetLockoutEndDateAsync(target, null);
            await userManager.ResetAccessFailedCountAsync(target);
            return ServiceResult.Ok();
        }, cancellationToken);

        if (!outcome.Succeeded)
        {
            return new RecoverOutcome(false, 0);
        }

        return new RecoverOutcome(true, await codes.RemainingAsync(userId, cancellationToken));
    }

    public async Task<OperatorResetOutcome> ResetByOperatorAsync(string userName, CancellationToken cancellationToken = default)
    {
        var lookup = await userManager.FindByNameAsync(userName.Trim());
        if (lookup is null)
        {
            return new OperatorResetOutcome(false, $"'{userName.Trim()}' kullanıcısı bulunamadı.", null, false);
        }

        if (!await userManager.IsInRoleAsync(lookup, Roles.Mudur))
        {
            return new OperatorResetOutcome(false, $"'{lookup.UserName}' bir müdür hesabı değil. Bu komut yalnızca müdür hesapları için kullanılabilir.", null, false);
        }

        var userId = lookup.Id;
        string? password = null;
        var banned = false;
        string? failure = null;
        var outcome = await db.ExecuteInTransactionAsync<ServiceResult>(async token =>
        {
            password = null;
            failure = null;
            var target = await userManager.FindByIdAsync(userId.ToString(CultureInfo.InvariantCulture));
            if (target is null)
            {
                failure = "Kullanıcı bulunamadı.";
                return Fail.NotFound(failure);
            }

            banned = target.IsBanned;
            var reset = await oneTimePasswords.ResetAsync(target, true, true);
            if (!reset.Result.Succeeded)
            {
                failure = string.Join(" ", reset.Result.Errors.Select(e => e.Description));
                return Fail.Validation(failure);
            }

            await codes.RevokeAllAsync(userId, token);

            var now = DateTime.UtcNow;
            await db.PasswordResetRequests
                .Where(r => r.UserId == userId && r.Status == PasswordResetStatus.Pending)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(r => r.Status, PasswordResetStatus.Completed)
                    .SetProperty(r => r.ProcessedAt, now), token);

            password = reset.Password;
            return ServiceResult.Ok();
        }, cancellationToken);

        if (!outcome.Succeeded || password is null)
        {
            return new OperatorResetOutcome(false, failure ?? "Şifre sıfırlanamadı.", null, banned);
        }

        return new OperatorResetOutcome(true, "Şifre sıfırlandı.", password, banned);
    }

    private Task<int> PadWriteAsync(CancellationToken cancellationToken) =>
        db.Users.Where(u => u.Id == 0).ExecuteUpdateAsync(s => s.SetProperty(u => u.AccessFailedCount, 0), cancellationToken);
}
