using System.Linq.Expressions;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Persistence;
using LGSApp.Infrastructure.Services.Access;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Notifications;
using LGSApp.Infrastructure.Services.Settings;
using Microsoft.EntityFrameworkCore;

namespace LGSApp.Infrastructure.Services.Comments;

public enum CommentSort
{
    Oldest = 0,
    Newest = 1
}

public sealed record CommentListQuery(int? SolutionId, CommentSort Sort, int Page, int PageSize, bool IncludeRemoved);

public sealed record CreateCommentCommand(string Body, int? ParentId, int? SolutionId);

public sealed record EditCommentCommand(string Body, byte[] RowVersion);

public sealed record CommentView(
    int Id,
    int? ParentId,
    int Depth,
    int? SolutionId,
    string Status,
    string? Body,
    UserRefView? Author,
    string? ReplyToUserName,
    DateTime CreatedAt,
    DateTime? EditedAt,
    bool IsMine,
    bool CanEdit,
    bool CanDelete,
    bool CanModerate,
    bool CanReport,
    DateTime? EditableUntil,
    byte[]? RowVersion,
    int ReplyCount,
    IReadOnlyList<CommentView> Replies);

public sealed record CommentThreadView(
    int QuestionId,
    int? SolutionId,
    int MaxDepth,
    bool CanComment,
    int TotalRootCount,
    int TotalCount,
    int Page,
    int PageSize,
    IReadOnlyList<CommentView> Items);

public interface ICommentService
{
    Task<ServiceResult<CommentThreadView>> GetThreadAsync(Actor actor, int questionId, CommentListQuery query, CancellationToken cancellationToken = default);
    Task<ServiceResult<CommentView>> CreateAsync(Actor actor, int questionId, CreateCommentCommand command, CancellationToken cancellationToken = default);
    Task<ServiceResult<CommentView>> EditAsync(Actor actor, int commentId, EditCommentCommand command, CancellationToken cancellationToken = default);
    Task<ServiceResult> DeleteAsync(Actor actor, int commentId, CancellationToken cancellationToken = default);
    Task<ServiceResult> RemoveAsync(Actor actor, int commentId, string reason, CancellationToken cancellationToken = default);
    Task<ServiceResult> RestoreAsync(Actor actor, int commentId, CancellationToken cancellationToken = default);
}

public sealed class CommentService(
    AppDbContext db,
    ISettingsService settings,
    IQuestionAccessService access,
    INotificationService notifications,
    UserLookupService users,
    TurkeyTime clock) : ICommentService
{
    private const string DiscussionDenied = "Yorumları görmek için önce soruyu cevaplamalısınız.";
    private const int MaxPageSize = 50;

    private static readonly Expression<Func<Comment, CommentNode>> NodeProjection = c => new CommentNode(
        c.Id,
        c.ParentId,
        c.Depth,
        c.SolutionId,
        c.Status,
        c.Body,
        c.AuthorUserId,
        c.ReplyToUserId,
        c.CreatedAt,
        c.EditedAt,
        c.RowVersion);

    public async Task<ServiceResult<CommentThreadView>> GetThreadAsync(Actor actor, int questionId, CommentListQuery query, CancellationToken cancellationToken = default)
    {
        if (query.Page < 1)
        {
            return Fail.Validation("Sayfa numarası 1 veya daha büyük olmalıdır.");
        }

        if (query.PageSize < 1 || query.PageSize > MaxPageSize)
        {
            return Fail.Validation($"Sayfa boyutu 1 ile {MaxPageSize} arasında olmalıdır.");
        }

        var gate = await access.RequireDiscussionAsync(questionId, actor, DiscussionDenied, cancellationToken);
        if (!gate.Succeeded)
        {
            return ServiceResult<CommentThreadView>.From(gate);
        }

        var includeRemoved = query.IncludeRemoved && actor.IsModerator;
        var solutionId = query.SolutionId;

        if (solutionId is int sid)
        {
            var solutionOk = await IsUsableSolutionAsync(questionId, sid, actor, cancellationToken);
            if (!solutionOk)
            {
                return Fail.NotFound("Çözüm bulunamadı.");
            }
        }

        var maxDepth = Math.Clamp(await settings.GetIntAsync(SettingKeys.YorumMaxDerinlik, cancellationToken), 1, CommentRules.AbsoluteMaxDepth);
        var editMinutes = await settings.GetIntAsync(SettingKeys.YorumDuzenlemeDk, cancellationToken);
        var perQuestionMax = await settings.GetIntAsync(SettingKeys.YorumSoruBasinaMax, cancellationToken);

        var scope = db.Comments.AsNoTracking().Where(c => c.QuestionId == questionId);
        scope = solutionId is int scopeSolution
            ? scope.Where(c => c.SolutionId == scopeSolution)
            : scope.Where(c => c.SolutionId == null);

        var rootQuery = scope.Where(c => c.ParentId == null);
        if (!includeRemoved)
        {
            rootQuery = rootQuery.Where(c => c.Status == CommentStatus.Active
                || db.Comments.Any(d => d.RootId == c.Id && d.Status == CommentStatus.Active));
        }

        var totalRoots = await rootQuery.CountAsync(cancellationToken);
        var totalActive = await scope.CountAsync(c => c.Status == CommentStatus.Active, cancellationToken);
        var questionTotal = await db.Comments.AsNoTracking().CountAsync(c => c.QuestionId == questionId, cancellationToken);

        var ordered = query.Sort == CommentSort.Newest
            ? rootQuery.OrderByDescending(c => c.CreatedAt).ThenByDescending(c => c.Id)
            : rootQuery.OrderBy(c => c.CreatedAt).ThenBy(c => c.Id);

        var roots = await ordered
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(NodeProjection)
            .ToListAsync(cancellationToken);

        var rootIds = roots.Select(r => r.Id).ToList();
        var descendants = rootIds.Count == 0
            ? new List<CommentNode>()
            : await db.Comments.AsNoTracking()
                .Where(c => c.RootId != null && rootIds.Contains(c.RootId.Value))
                .OrderBy(c => c.CreatedAt).ThenBy(c => c.Id)
                .Select(NodeProjection)
                .ToListAsync(cancellationToken);

        var tree = CommentTreeBuilder.Build(roots, descendants, includeRemoved);

        var userIds = new HashSet<int>();
        CollectUserIds(tree, userIds);
        var people = await users.GetAsync(userIds, actor.IsModerator, cancellationToken);

        var context = new ViewContext(actor, people, clock.UtcNow, editMinutes);
        var items = tree.Select(n => ToView(n, context)).ToList();

        var canComment = questionTotal < perQuestionMax;
        return ServiceResult<CommentThreadView>.Ok(new CommentThreadView(
            questionId,
            solutionId,
            maxDepth,
            canComment,
            totalRoots,
            totalActive,
            query.Page,
            query.PageSize,
            items));
    }

    public async Task<ServiceResult<CommentView>> CreateAsync(Actor actor, int questionId, CreateCommentCommand command, CancellationToken cancellationToken = default)
    {
        var body = CommentRules.Normalize(command.Body);
        var maxLength = Math.Min(await settings.GetIntAsync(SettingKeys.YorumMaxKarakter, cancellationToken), CommentRules.BodyColumnMaxLength);
        if (body.Length == 0)
        {
            return Fail.Validation("Yorum boş olamaz.");
        }

        if (body.Length > maxLength)
        {
            return Fail.Validation($"Yorum en fazla {maxLength} karakter olabilir.");
        }

        var gate = await access.RequireDiscussionAsync(questionId, actor, DiscussionDenied, cancellationToken);
        if (!gate.Succeeded)
        {
            return ServiceResult<CommentView>.From(gate);
        }

        var maxDepth = Math.Clamp(await settings.GetIntAsync(SettingKeys.YorumMaxDerinlik, cancellationToken), 1, CommentRules.AbsoluteMaxDepth);
        var editMinutes = await settings.GetIntAsync(SettingKeys.YorumDuzenlemeDk, cancellationToken);
        var perQuestionMax = await settings.GetIntAsync(SettingKeys.YorumSoruBasinaMax, cancellationToken);

        Comment? parent = null;
        int? solutionId = null;
        int? solutionAuthorId = null;

        if (command.ParentId is int parentId)
        {
            parent = await db.Comments.AsNoTracking().FirstOrDefaultAsync(c => c.Id == parentId && c.QuestionId == questionId, cancellationToken);
            if (parent is null)
            {
                return Fail.NotFound("Yanıtlanan yorum bulunamadı.");
            }

            if (parent.Status != CommentStatus.Active)
            {
                return Fail.Conflict("Yanıtlanan yorum kaldırılmış.");
            }

            solutionId = parent.SolutionId;
        }
        else if (command.SolutionId is int sid)
        {
            var solution = await db.Solutions.AsNoTracking()
                .Where(s => s.Id == sid && s.QuestionId == questionId && !s.IsDeleted && (actor.IsModerator || !s.IsHidden))
                .Select(s => new { s.Id, s.AuthorUserId })
                .FirstOrDefaultAsync(cancellationToken);
            if (solution is null)
            {
                return Fail.NotFound("Çözüm bulunamadı.");
            }

            solutionId = solution.Id;
            solutionAuthorId = solution.AuthorUserId;
        }

        var questionTotal = await db.Comments.CountAsync(c => c.QuestionId == questionId, cancellationToken);
        if (questionTotal >= perQuestionMax)
        {
            return Fail.Conflict("Bu soruya daha fazla yorum eklenemez.");
        }

        var now = clock.UtcNow;
        var windowStart = now.AddSeconds(-CommentRules.DuplicateWindowSeconds);
        var duplicate = await db.Comments.AnyAsync(
            c => c.AuthorUserId == actor.UserId && c.QuestionId == questionId && c.Body == body && c.CreatedAt >= windowStart,
            cancellationToken);
        if (duplicate)
        {
            return Fail.Conflict("Aynı yorumu kısa süre içinde tekrar gönderdiniz.");
        }

        var comment = new Comment
        {
            QuestionId = questionId,
            SolutionId = solutionId,
            AuthorUserId = actor.UserId,
            Body = body,
            Status = CommentStatus.Active,
            CreatedAt = now
        };

        int? notifyUserId;
        NotificationType notifyType;
        string notifyText;
        var people = await users.GetAsync([actor.UserId], actor.IsModerator, cancellationToken);
        var actorName = people.TryGetValue(actor.UserId, out var me) ? me.UserName : "Bir kullanıcı";

        if (parent is null)
        {
            comment.Depth = 0;
            if (solutionAuthorId is not null)
            {
                notifyUserId = solutionAuthorId;
                notifyType = NotificationType.CommentOnSolution;
                notifyText = $"{actorName} çözümünüze yorum yazdı.";
            }
            else
            {
                notifyUserId = gate.Value!.Facts.AuthorUserId;
                notifyType = NotificationType.CommentOnQuestion;
                notifyText = $"{actorName} sorunuza yorum yazdı.";
            }
        }
        else
        {
            if (parent.Depth >= maxDepth && parent.ParentId is not null)
            {
                comment.ParentId = parent.ParentId;
                comment.RootId = parent.RootId;
                comment.Depth = parent.Depth;
                comment.ReplyToUserId = parent.AuthorUserId;
            }
            else
            {
                comment.ParentId = parent.Id;
                comment.RootId = parent.RootId ?? parent.Id;
                comment.Depth = (byte)(parent.Depth + 1);
            }

            notifyUserId = parent.AuthorUserId;
            notifyType = NotificationType.CommentReply;
            notifyText = $"{actorName} yorumunuza yanıt verdi.";
        }

        db.Comments.Add(comment);

        if (notifyUserId is int recipient)
        {
            await notifications.NotifyAsync(
                new NotificationDraft(
                    recipient,
                    notifyType,
                    notifyText,
                    QuestionId: questionId,
                    CommentEntity: comment,
                    SenderUserId: actor.UserId),
                true,
                cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);

        var userIds = new HashSet<int> { actor.UserId };
        if (comment.ReplyToUserId is int replyTo)
        {
            userIds.Add(replyTo);
        }

        var viewUsers = await users.GetAsync(userIds, actor.IsModerator, cancellationToken);
        var node = new CommentTreeNode(ToNode(comment), false);
        return ServiceResult<CommentView>.Ok(ToView(node, new ViewContext(actor, viewUsers, now, editMinutes)));
    }

    public async Task<ServiceResult<CommentView>> EditAsync(Actor actor, int commentId, EditCommentCommand command, CancellationToken cancellationToken = default)
    {
        var comment = await db.Comments.FirstOrDefaultAsync(c => c.Id == commentId, cancellationToken);
        if (comment is null)
        {
            return Fail.NotFound("Yorum bulunamadı.");
        }

        if (comment.AuthorUserId != actor.UserId)
        {
            return Fail.Forbidden("Yalnızca kendi yorumunuzu düzenleyebilirsiniz.");
        }

        var gate = await access.RequireDiscussionAsync(comment.QuestionId, actor, DiscussionDenied, cancellationToken);
        if (!gate.Succeeded)
        {
            return ServiceResult<CommentView>.From(gate);
        }

        if (comment.Status != CommentStatus.Active)
        {
            return Fail.Conflict("Bu yorum artık düzenlenemez.");
        }

        var editMinutes = await settings.GetIntAsync(SettingKeys.YorumDuzenlemeDk, cancellationToken);
        var now = clock.UtcNow;
        if (now > comment.CreatedAt.AddMinutes(editMinutes))
        {
            return Fail.Forbidden($"Yorum düzenleme süresi ({editMinutes} dakika) doldu.");
        }

        var body = CommentRules.Normalize(command.Body);
        var maxLength = Math.Min(await settings.GetIntAsync(SettingKeys.YorumMaxKarakter, cancellationToken), CommentRules.BodyColumnMaxLength);
        if (body.Length == 0)
        {
            return Fail.Validation("Yorum boş olamaz.");
        }

        if (body.Length > maxLength)
        {
            return Fail.Validation($"Yorum en fazla {maxLength} karakter olabilir.");
        }

        if (!comment.RowVersion.SequenceEqual(command.RowVersion))
        {
            return Fail.Conflict("Yorum başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }

        if (!string.Equals(body, comment.Body, StringComparison.Ordinal))
        {
            db.Entry(comment).Property(c => c.RowVersion).OriginalValue = command.RowVersion;
            comment.Body = body;
            comment.EditedAt = now;
            comment.EditCount = (byte)Math.Min(comment.EditCount + 1, CommentRules.MaxEditCount);

            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Fail.Conflict("Yorum başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
            }
        }

        var userIds = new HashSet<int> { comment.AuthorUserId };
        if (comment.ReplyToUserId is int replyTo)
        {
            userIds.Add(replyTo);
        }

        var viewUsers = await users.GetAsync(userIds, actor.IsModerator, cancellationToken);
        var node = new CommentTreeNode(ToNode(comment), false);
        return ServiceResult<CommentView>.Ok(ToView(node, new ViewContext(actor, viewUsers, now, editMinutes)));
    }

    public async Task<ServiceResult> DeleteAsync(Actor actor, int commentId, CancellationToken cancellationToken = default)
    {
        var comment = await db.Comments.FirstOrDefaultAsync(c => c.Id == commentId, cancellationToken);
        if (comment is null)
        {
            return Fail.NotFound("Yorum bulunamadı.");
        }

        if (comment.AuthorUserId != actor.UserId)
        {
            return Fail.Forbidden("Yalnızca kendi yorumunuzu silebilirsiniz.");
        }

        if (comment.Status == CommentStatus.DeletedByAuthor)
        {
            return ServiceResult.Ok();
        }

        if (comment.Status != CommentStatus.Active)
        {
            return Fail.Conflict("Bu yorum yönetici tarafından kaldırılmış.");
        }

        comment.Status = CommentStatus.DeletedByAuthor;
        comment.DeletedAt = clock.UtcNow;
        comment.DeletedByUserId = actor.UserId;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Fail.Conflict("Yorum başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }

        return ServiceResult.Ok();
    }

    public async Task<ServiceResult> RemoveAsync(Actor actor, int commentId, string reason, CancellationToken cancellationToken = default)
    {
        if (!actor.IsModerator)
        {
            return Fail.Forbidden("Yalnızca öğretmen veya müdür yorum kaldırabilir.");
        }

        var cleaned = (reason ?? string.Empty).Trim();
        if (cleaned.Length == 0)
        {
            return Fail.Validation("Kaldırma nedeni zorunludur.");
        }

        if (cleaned.Length > CommentRules.ModerationReasonMaxLength)
        {
            return Fail.Validation($"Kaldırma nedeni en fazla {CommentRules.ModerationReasonMaxLength} karakter olabilir.");
        }

        var comment = await db.Comments.FirstOrDefaultAsync(c => c.Id == commentId, cancellationToken);
        if (comment is null)
        {
            return Fail.NotFound("Yorum bulunamadı.");
        }

        if (comment.Status != CommentStatus.Active)
        {
            return Fail.Conflict("Bu yorum zaten yayından kaldırılmış.");
        }

        comment.Status = CommentStatus.RemovedByModerator;
        comment.ModerationReason = cleaned;
        comment.DeletedAt = clock.UtcNow;
        comment.DeletedByUserId = actor.UserId;

        await notifications.NotifyAsync(
            new NotificationDraft(
                comment.AuthorUserId,
                NotificationType.CommentRemoved,
                "Yorumunuz yönetici tarafından kaldırıldı.",
                QuestionId: comment.QuestionId,
                CommentId: comment.Id,
                SenderUserId: actor.UserId),
            false,
            cancellationToken);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Fail.Conflict("Yorum başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }

        return ServiceResult.Ok();
    }

    public async Task<ServiceResult> RestoreAsync(Actor actor, int commentId, CancellationToken cancellationToken = default)
    {
        if (!actor.IsMudur)
        {
            return Fail.Forbidden("Yalnızca müdür yorumu geri yükleyebilir.");
        }

        var comment = await db.Comments.FirstOrDefaultAsync(c => c.Id == commentId, cancellationToken);
        if (comment is null)
        {
            return Fail.NotFound("Yorum bulunamadı.");
        }

        if (comment.Status != CommentStatus.RemovedByModerator)
        {
            return Fail.Conflict("Yalnızca yönetici tarafından kaldırılan yorumlar geri yüklenebilir.");
        }

        comment.Status = CommentStatus.Active;
        comment.ModerationReason = null;
        comment.DeletedAt = null;
        comment.DeletedByUserId = null;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Fail.Conflict("Yorum başka bir işlemle değiştirilmiş. Sayfayı yenileyip tekrar deneyin.");
        }

        return ServiceResult.Ok();
    }

    private Task<bool> IsUsableSolutionAsync(int questionId, int solutionId, Actor actor, CancellationToken cancellationToken) =>
        db.Solutions.AsNoTracking().AnyAsync(
            s => s.Id == solutionId && s.QuestionId == questionId && !s.IsDeleted && (actor.IsModerator || !s.IsHidden),
            cancellationToken);

    private static CommentNode ToNode(Comment c) => new(
        c.Id,
        c.ParentId,
        c.Depth,
        c.SolutionId,
        c.Status,
        c.Body,
        c.AuthorUserId,
        c.ReplyToUserId,
        c.CreatedAt,
        c.EditedAt,
        c.RowVersion);

    private static void CollectUserIds(IEnumerable<CommentTreeNode> nodes, HashSet<int> ids)
    {
        foreach (var node in nodes)
        {
            if (!node.IsPlaceholder)
            {
                ids.Add(node.Source.AuthorUserId);
                if (node.Source.ReplyToUserId is int replyTo)
                {
                    ids.Add(replyTo);
                }
            }

            CollectUserIds(node.Replies, ids);
        }
    }

    private sealed record ViewContext(Actor Actor, IReadOnlyDictionary<int, UserRefView> Users, DateTime Now, int EditMinutes);

    private static CommentView ToView(CommentTreeNode node, ViewContext ctx)
    {
        var source = node.Source;
        var live = !node.IsPlaceholder;
        var active = source.Status == CommentStatus.Active;
        var isMine = source.AuthorUserId == ctx.Actor.UserId;
        var editableUntil = source.CreatedAt.AddMinutes(ctx.EditMinutes);
        var canEdit = live && isMine && active && ctx.Now <= editableUntil;
        var canDelete = live && isMine && active;
        var canModerate = live
            && ((ctx.Actor.IsModerator && active) || (ctx.Actor.IsMudur && source.Status == CommentStatus.RemovedByModerator));
        var canReport = live && !isMine && active;

        UserRefView? author = null;
        string? replyToName = null;
        if (live)
        {
            ctx.Users.TryGetValue(source.AuthorUserId, out author);
            if (source.ReplyToUserId is int replyTo && ctx.Users.TryGetValue(replyTo, out var replyUser))
            {
                replyToName = replyUser.UserName;
            }
        }

        var status = source.Status switch
        {
            CommentStatus.Active => "active",
            CommentStatus.DeletedByAuthor => "deleted",
            _ => "removed"
        };

        return new CommentView(
            source.Id,
            source.ParentId,
            source.Depth,
            source.SolutionId,
            status,
            live ? source.Body : null,
            author,
            replyToName,
            source.CreatedAt,
            live ? source.EditedAt : null,
            live && isMine,
            canEdit,
            canDelete,
            canModerate,
            canReport,
            live && isMine && active ? editableUntil : null,
            live && isMine ? source.RowVersion : null,
            node.ReplyCount,
            node.Replies.Select(r => ToView(r, ctx)).ToList());
    }
}
