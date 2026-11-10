using System.Security.Claims;
using LGSApp.Api.Authorization;
using LGSApp.Api.Dtos;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/admin/password-reset-requests")]
[Authorize(Policy = Policies.MudurOnly)]
public class AdminPasswordResetRequestsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly OneTimePasswordService _oneTimePasswords;

    public AdminPasswordResetRequestsController(AppDbContext db, OneTimePasswordService oneTimePasswords)
    {
        _db = db;
        _oneTimePasswords = oneTimePasswords;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<PasswordResetRequestDto>>> ListPending(CancellationToken cancellationToken)
    {
        var rows = await _db.PasswordResetRequests
            .AsNoTracking()
            .Where(r => r.Status == PasswordResetStatus.Pending)
            .OrderBy(r => r.CreatedAt)
            .Select(r => new PasswordResetRequestDto(
                r.Id,
                r.UserId,
                r.User.UserName ?? string.Empty,
                r.User.FirstName,
                r.User.LastName,
                r.User.ClassName,
                r.CreatedAt))
            .ToListAsync(cancellationToken);

        return Ok(rows);
    }

    [HttpPost("{id:int}/complete")]
    public async Task<ActionResult<OneTimePasswordResponse>> Complete(int id)
    {
        var adminId = CurrentUserId();
        ActionResult? error = null;
        OneTimePasswordResponse? response = null;

        var strategy = _db.Database.CreateExecutionStrategy();
        try
        {
            await strategy.ExecuteAsync(async () =>
            {
                error = null;
                response = null;
                _db.ChangeTracker.Clear();

                await using var transaction = await _db.Database.BeginTransactionAsync();

                var request = await _db.PasswordResetRequests
                    .Include(r => r.User)
                    .FirstOrDefaultAsync(r => r.Id == id);
                if (request is null)
                {
                    error = NotFound();
                    return;
                }

                if (request.Status != PasswordResetStatus.Pending)
                {
                    error = Problem(statusCode: StatusCodes.Status409Conflict, title: "Talep zaten işlenmiş.");
                    return;
                }

                if (request.User.IsBanned)
                {
                    error = Problem(statusCode: StatusCodes.Status409Conflict, title: "Hesap engelli olduğu için şifre yenilenemez.");
                    return;
                }

                var outcome = await _oneTimePasswords.ResetAsync(request.User, true);
                if (!outcome.Result.Succeeded)
                {
                    error = Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "İşlem başarısız.",
                        detail: string.Join(" ", outcome.Result.Errors.Select(e => e.Description)));
                    return;
                }

                request.Status = PasswordResetStatus.Completed;
                request.ProcessedAt = DateTime.UtcNow;
                request.ProcessedByUserId = adminId;
                await _db.SaveChangesAsync();
                await transaction.CommitAsync();

                response = new OneTimePasswordResponse(request.UserId, outcome.Password, true);
            });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, title: "Talep başka bir yönetici tarafından işlendi.");
        }

        if (response is null)
        {
            return error ?? Problem(statusCode: StatusCodes.Status500InternalServerError, title: "İşlem tamamlanamadı.");
        }

        return Ok(response);
    }

    [HttpPost("{id:int}/reject")]
    public async Task<IActionResult> Reject(int id, CancellationToken cancellationToken)
    {
        var request = await _db.PasswordResetRequests.FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (request is null)
        {
            return NotFound();
        }

        if (request.Status != PasswordResetStatus.Pending)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, title: "Talep zaten işlenmiş.");
        }

        request.Status = PasswordResetStatus.Rejected;
        request.ProcessedAt = DateTime.UtcNow;
        request.ProcessedByUserId = CurrentUserId();

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, title: "Talep başka bir yönetici tarafından işlendi.");
        }

        return NoContent();
    }

    private int? CurrentUserId() =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
}
