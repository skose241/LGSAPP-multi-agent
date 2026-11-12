using System.Diagnostics;

namespace LGSApp.Api.Extensions;

public static class ResponseTimer
{
    public static async Task WaitForMinimumAsync(long started, int minimumMilliseconds, CancellationToken cancellationToken)
    {
        if (minimumMilliseconds <= 0)
        {
            return;
        }

        var remaining = TimeSpan.FromMilliseconds(minimumMilliseconds) - Stopwatch.GetElapsedTime(started);
        if (remaining > TimeSpan.Zero)
        {
            await Task.Delay(remaining, cancellationToken);
        }
    }
}
