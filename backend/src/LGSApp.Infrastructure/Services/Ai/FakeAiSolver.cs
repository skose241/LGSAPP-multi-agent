using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Services.Ai;

public interface IFakeAnswerKeySource
{
    Task<int?> GetKeyAsync(int questionId, CancellationToken cancellationToken);
}

public sealed class DbFakeAnswerKeySource(IServiceScopeFactory scopes) : IFakeAnswerKeySource
{
    public async Task<int?> GetKeyAsync(int questionId, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Questions.AsNoTracking()
            .Where(q => q.Id == questionId)
            .Select(q => (int?)q.CorrectOption)
            .FirstOrDefaultAsync(cancellationToken);
    }
}

public sealed class FakeAiSolver(IOptions<AiOptions> options, IFakeAnswerKeySource keys, TimeProvider timeProvider) : IAiSolver
{
    private long calls;

    public bool IsConfigured => true;

    public async Task<AiSolveResult> SolveAsync(int questionId, AiSolveInput input, AiSolveMode mode, CancellationToken cancellationToken)
    {
        var fake = options.Value.Fake;
        if (fake.DelayMs > 0)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(fake.DelayMs), timeProvider, cancellationToken);
        }

        var sequence = Interlocked.Increment(ref calls);
        var prompt = AiPrompts.SolveUser(input.ToPromptData(mode));
        var duration = Math.Max(0, fake.DelayMs);
        bool? disagree = mode == AiSolveMode.Verified ? false : null;

        if (fake.UnreadableIdSet.Contains(questionId))
        {
            return Build(false, 0, "low", string.Empty, disagree, prompt, duration);
        }

        var key = mode == AiSolveMode.Verified ? input.VerifiedOption : await keys.GetKeyAsync(questionId, cancellationToken);
        if (key is not (>= 1 and <= 4))
        {
            return Build(true, 0, "low", string.Empty, disagree, prompt, duration);
        }

        var mismatch = fake.MismatchEveryNth > 0 && sequence % fake.MismatchEveryNth == 0;
        var answer = mismatch ? key.Value % 4 + 1 : key.Value;
        var solution = $"[Test] Sahte yapay zekâ çözümü. Doğru seçenek {AiPrompts.Letter(answer)} şıkkıdır; bu açıklama en az elli karakter olacak biçimde yazılmıştır.";
        return Build(true, answer, "high", solution, mode == AiSolveMode.Verified ? !mismatch : null, prompt, duration);
    }

    private static AiSolveResult Build(bool readable, int answer, string confidence, string solution, bool? agrees, string prompt, int duration) =>
        new(AiErrorKind.None, null, readable, answer, confidence, solution, agrees, "fake", prompt, "{}", 0, 0, 0, 200, 1, duration, "fake", null, "STOP");
}
