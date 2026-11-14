using LGSApp.Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Ai;

public sealed class AiCostCalculator(IOptions<AiOptions> options)
{
    private const decimal TokensPerUnit = 1_000_000m;

    public decimal? Calculate(string? model, int? inputTokens, int? outputTokens, int? thinkingTokens)
    {
        if (string.IsNullOrWhiteSpace(model) || (inputTokens is null && outputTokens is null && thinkingTokens is null))
        {
            return null;
        }

        var pricing = options.Value.Pricing;
        if (!pricing.TryGetValue(model.Trim(), out var price))
        {
            var match = pricing.Keys
                .Where(k => model.StartsWith(k, StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(k => k.Length)
                .FirstOrDefault();
            if (match is null)
            {
                return null;
            }

            price = pricing[match];
        }

        var input = Math.Max(0, inputTokens ?? 0) * price.InputPerMTokUsd;
        var output = (Math.Max(0, outputTokens ?? 0) + Math.Max(0, thinkingTokens ?? 0)) * price.OutputPerMTokUsd;
        return Math.Round((input + output) / TokensPerUnit, 6, MidpointRounding.AwayFromZero);
    }
}
