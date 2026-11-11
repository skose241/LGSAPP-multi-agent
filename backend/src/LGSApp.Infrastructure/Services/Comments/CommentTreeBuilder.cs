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
    public bool HasMoreReplies { get; internal set; }
    public int HiddenReplyCount { get; internal set; }
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

    public static void Truncate(IReadOnlyList<CommentTreeNode> nodes, int visibleDepth)
    {
        foreach (var node in nodes)
        {
            TruncateNode(node, 0, visibleDepth);
        }
    }

    public static void LimitTotal(IReadOnlyList<CommentTreeNode> nodes, int maxNodes)
    {
        var perLevel = new List<int>();
        foreach (var node in nodes)
        {
            CountLevels(node, 0, perLevel);
        }

        var cumulative = 0;
        var allowedLevel = -1;
        for (var level = 0; level < perLevel.Count; level++)
        {
            cumulative += perLevel[level];
            if (cumulative > maxNodes)
            {
                break;
            }

            allowedLevel = level;
        }

        if (allowedLevel == perLevel.Count - 1)
        {
            return;
        }

        Truncate(nodes, Math.Max(allowedLevel, 0));
    }

    private static void CountLevels(CommentTreeNode node, int level, List<int> perLevel)
    {
        while (perLevel.Count <= level)
        {
            perLevel.Add(0);
        }

        perLevel[level]++;
        foreach (var child in node.Replies)
        {
            CountLevels(child, level + 1, perLevel);
        }
    }

    public static IReadOnlyList<CommentTreeNode>? FindPath(IReadOnlyList<CommentTreeNode> roots, int id)
    {
        foreach (var root in roots)
        {
            var path = new List<CommentTreeNode>();
            if (TryFindPath(root, id, path))
            {
                return path;
            }
        }

        return null;
    }

    private static void TruncateNode(CommentTreeNode node, int level, int visibleDepth)
    {
        if (level >= visibleDepth)
        {
            if (node.Replies.Count > 0)
            {
                node.Replies = [];
                node.HasMoreReplies = true;
                node.HiddenReplyCount = node.ReplyCount;
            }

            return;
        }

        foreach (var child in node.Replies)
        {
            TruncateNode(child, level + 1, visibleDepth);
        }
    }

    private static bool TryFindPath(CommentTreeNode node, int id, List<CommentTreeNode> path)
    {
        path.Add(node);
        if (node.Source.Id == id)
        {
            return true;
        }

        foreach (var child in node.Replies)
        {
            if (TryFindPath(child, id, path))
            {
                return true;
            }
        }

        path.RemoveAt(path.Count - 1);
        return false;
    }
}
