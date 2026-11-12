namespace LGSApp.Infrastructure.Services.Common;

public sealed class OffsetTimeProvider(TimeSpan offset) : TimeProvider
{
    public TimeSpan Offset { get; } = offset;

    public override DateTimeOffset GetUtcNow() => base.GetUtcNow() + Offset;
}
