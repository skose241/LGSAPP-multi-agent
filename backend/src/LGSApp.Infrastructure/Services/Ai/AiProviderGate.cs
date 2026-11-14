using System.Collections.Concurrent;
using System.Text;
using LGSApp.Domain.Constants;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Ai;

public readonly record struct AiGateState(AiErrorKind Kind, int RetryAfterSeconds);

public sealed class AiProviderGate(TimeProvider timeProvider, IOptions<AiOptions> options)
{
    private sealed record Entry(AiErrorKind Kind, DateTimeOffset Until);

    private readonly ConcurrentDictionary<AiKeyPurpose, Entry> entries = new();

    public static bool Trips(AiErrorKind kind) => kind is AiErrorKind.QuotaExhausted or AiErrorKind.AuthFailed;

    public void Observe(AiKeyPurpose purpose, AiErrorKind kind)
    {
        if (!Trips(kind))
        {
            return;
        }

        var now = timeProvider.GetUtcNow();
        var until = kind == AiErrorKind.QuotaExhausted
            ? now.AddSeconds(GeminiQuotaReset.SecondsUntilPacificMidnight(now.UtcDateTime))
            : now.AddMinutes(PauseMinutes(purpose));
        entries.AddOrUpdate(
            purpose,
            new Entry(kind, until),
            (_, current) => current.Until >= until ? current : new Entry(kind, until));
    }

    public AiGateState? Check(AiKeyPurpose purpose)
    {
        if (!entries.TryGetValue(purpose, out var entry))
        {
            return null;
        }

        var now = timeProvider.GetUtcNow();
        if (entry.Until <= now)
        {
            entries.TryRemove(new KeyValuePair<AiKeyPurpose, Entry>(purpose, entry));
            return null;
        }

        return new AiGateState(entry.Kind, Math.Max(1, (int)Math.Ceiling((entry.Until - now).TotalSeconds)));
    }

    private int PauseMinutes(AiKeyPurpose purpose)
    {
        var o = options.Value;
        var minutes = purpose == AiKeyPurpose.Solution ? o.Solution.AuthFailedPauseMinutes : o.Question.AuthFailedPauseMinutes;
        return Math.Max(1, minutes);
    }
}

public static class AiErrorText
{
    public static string? Sanitize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var max = AiRules.ErrorMessageMaxLength;
        var builder = new StringBuilder(Math.Min(value.Length, max));
        var pendingSpace = false;
        foreach (var ch in value)
        {
            if (char.IsControl(ch) || char.IsWhiteSpace(ch))
            {
                pendingSpace = builder.Length > 0;
                continue;
            }

            if (pendingSpace)
            {
                if (builder.Length >= max)
                {
                    break;
                }

                builder.Append(' ');
                pendingSpace = false;
            }

            if (builder.Length >= max)
            {
                break;
            }

            builder.Append(ch);
        }

        if (builder.Length > 0 && char.IsHighSurrogate(builder[^1]))
        {
            builder.Length--;
        }

        return builder.Length == 0 ? null : builder.ToString();
    }
}
