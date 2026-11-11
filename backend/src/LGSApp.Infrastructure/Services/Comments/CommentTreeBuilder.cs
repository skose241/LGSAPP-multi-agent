using LGSApp.Domain.Entities;

namespace LGSApp.Infrastructure.Services.Comments;

public sealed record CommentNode(
    int Id,
    int? ParentId,
    int Depth,
    int? SolutionId,
    CommentStatus Status,
    string Body,
    int AuthorUserId,
    int? ReplyToUserId,
    DateTime CreatedAt,
    DateTime? EditedAt,
    byte[] RowVersion);

public sealed class CommentTreeNode(CommentNode source, bool isPlaceholder)
{
    public CommentNode Source { get; } = source;
    public bool IsPlaceholder { get; } = isPlaceholder;
    public List<CommentTreeNode> Replies { get; internal set; } = [];
    public int ReplyCount { get; internal set; }
}

public static class CommentTreeBuilder
{
    public static IReadOnlyList<CommentTreeNode> Build(
        IReadOnlyList<CommentNode> roots,
        IReadOnlyList<CommentNode> descendants,
        bool includeRemoved)
    {
        var nodes = new Dictionary<int, CommentTreeNode>(roots.Count + descendants.Count);
        var rootNodes = new List<CommentTreeNode>(roots.Count);

        foreach (var root in roots)
        {
            var node = Create(root, includeRemoved);
            nodes[root.Id] = node;
            rootNodes.Add(node);
        }

        var ordered = descendants.OrderBy(d => d.CreatedAt).ThenBy(d => d.Id).ToList();
        foreach (var item in ordered)
        {
            nodes[item.Id] = Create(item, includeRemoved);
        }

        foreach (var item in ordered)
        {
            if (item.ParentId is int parentId && nodes.TryGetValue(parentId, out var parent))
            {
                parent.Replies.Add(nodes[item.Id]);
            }
        }

        var result = new List<CommentTreeNode>(rootNodes.Count);
        foreach (var root in rootNodes)
        {
            if (Prune(root, includeRemoved))
            {
                result.Add(root);
            }
        }

        return result;
    }

    private static CommentTreeNode Create(CommentNode source, bool includeRemoved) =>
        new(source, !includeRemoved && source.Status != CommentStatus.Active);

    private static bool Prune(CommentTreeNode node, bool includeRemoved)
    {
        var kept = new List<CommentTreeNode>(node.Replies.Count);
        var count = 0;
        foreach (var child in node.Replies)
        {
            if (Prune(child, includeRemoved))
            {
                kept.Add(child);
                count += 1 + child.ReplyCount;
            }
        }

        node.Replies = kept;
        node.ReplyCount = count;
        return includeRemoved || node.Source.Status == CommentStatus.Active || kept.Count > 0;
    }
}
