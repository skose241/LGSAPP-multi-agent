using LGSApp.Api.Authorization;
using LGSApp.Api.Extensions;
using LGSApp.Infrastructure.Services.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LGSApp.Api.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize(Policy = Policies.Kullanici)]
public class NotificationsController(INotificationInboxService inbox) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<NotificationListView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(
        [FromQuery] bool unreadOnly = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default) =>
        (await inbox.ListAsync(User.ToActor(), unreadOnly, page, pageSize, cancellationToken)).ToActionResult(this);

    [HttpGet("unread-count")]
    [ProducesResponseType<UnreadCountView>(StatusCodes.Status200OK)]
    public async Task<IActionResult> UnreadCount(CancellationToken cancellationToken) =>
        Ok(await inbox.UnreadCountAsync(User.ToActor(), cancellationToken));

    [HttpPost("{id:long}/read")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkRead(long id, CancellationToken cancellationToken) =>
        (await inbox.MarkReadAsync(User.ToActor(), id, cancellationToken)).ToActionResult(this);

    [HttpPost("read-all")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkAllRead(CancellationToken cancellationToken) =>
        (await inbox.MarkAllReadAsync(User.ToActor(), cancellationToken)).ToActionResult(this);
}
