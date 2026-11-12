using System.Globalization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace LGSApp.Infrastructure.Options;

public class FakeGeneratorOptions
{
    public string FailSlots { get; set; } = string.Empty;
    public int DelayMs { get; set; }

    public IReadOnlySet<int> FailSlotSet => ParseSlots(FailSlots) ?? [];

    public static HashSet<int>? ParseSlots(string? value)
    {
        var result = new HashSet<int>();
        if (string.IsNullOrWhiteSpace(value))
        {
            return result;
        }

        foreach (var part in value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!int.TryParse(part, NumberStyles.Integer, CultureInfo.InvariantCulture, out var slot) || slot is < 1 or > 20)
            {
                return null;
            }

            result.Add(slot);
        }

        return result;
    }
}

public class SchedulerOptions
{
    public const string SectionName = "Scheduler";
    public const int MaxSleepHours = 6;

    private static readonly string[] TimeFormats = ["HH:mm", "H:mm"];

    public bool Enabled { get; set; } = true;
    public string GenerateAt { get; set; } = "17:30";
    public string CompleteAt { get; set; } = "18:15";
    public string PublishAt { get; set; } = "19:00";
    public string AssignmentsAt { get; set; } = "00:05";
    public string TopicSelectionDeadline { get; set; } = "16:45";
    public string CatchUpGenerateUntil { get; set; } = "23:00";
    public int CompleteMinGapMinutes { get; set; } = 15;
    public int PublishWaitMaxMinutes { get; set; } = 30;
    public int LeaseSeconds { get; set; } = 180;
    public int HeartbeatSeconds { get; set; } = 45;
    public int MaxRunMinutes { get; set; } = 45;
    public int DelayBetweenAiCallsSeconds { get; set; } = 6;
    public int MaxTimerAttemptsPerDay { get; set; } = 3;
    public int RetryDelayMinutes { get; set; } = 10;
    public int MaxSlotsPerLesson { get; set; } = 20;
    public int StartupDelaySeconds { get; set; } = 15;
    public bool UseFakeGenerator { get; set; }
    public FakeGeneratorOptions FakeGenerator { get; set; } = new();

    public TimeOnly GenerateTime => Parse(GenerateAt);
    public TimeOnly CompleteTime => Parse(CompleteAt);
    public TimeOnly PublishTime => Parse(PublishAt);
    public TimeOnly AssignmentsTime => Parse(AssignmentsAt);
    public TimeOnly TopicDeadlineTime => Parse(TopicSelectionDeadline);
    public TimeOnly CatchUpUntilTime => Parse(CatchUpGenerateUntil);

    public static bool TryParseTime(string? value, out TimeOnly time) =>
        TimeOnly.TryParseExact(value?.Trim(), TimeFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out time);

    private static TimeOnly Parse(string value) =>
        TimeOnly.ParseExact(value.Trim(), TimeFormats, CultureInfo.InvariantCulture, DateTimeStyles.None);

    public static string? Validate(SchedulerOptions o, bool isDevelopment)
    {
        var names = new (string Name, string Value)[]
        {
            (nameof(GenerateAt), o.GenerateAt),
            (nameof(CompleteAt), o.CompleteAt),
            (nameof(PublishAt), o.PublishAt),
            (nameof(AssignmentsAt), o.AssignmentsAt),
            (nameof(TopicSelectionDeadline), o.TopicSelectionDeadline),
            (nameof(CatchUpGenerateUntil), o.CatchUpGenerateUntil)
        };

        foreach (var (name, value) in names)
        {
            if (!TryParseTime(value, out _))
            {
                return $"Scheduler:{name} 'SS:dd' biçiminde geçerli bir saat olmalıdır (örnek 17:30).";
            }
        }

        if (!(o.GenerateTime < o.CompleteTime && o.CompleteTime < o.PublishTime))
        {
            return "Scheduler saatleri Generate < Complete < Publish sırasında olmalıdır.";
        }

        if (o.TopicDeadlineTime > o.GenerateTime)
        {
            return "Scheduler:TopicSelectionDeadline, GenerateAt saatinden geç olamaz.";
        }

        if (o.CatchUpUntilTime < o.GenerateTime)
        {
            return "Scheduler:CatchUpGenerateUntil, GenerateAt saatinden erken olamaz.";
        }

        if (o.LeaseSeconds is < 30 or > 3600)
        {
            return "Scheduler:LeaseSeconds 30 ile 3600 arasında olmalıdır.";
        }

        if (o.HeartbeatSeconds < 5 || o.HeartbeatSeconds * 3 > o.LeaseSeconds)
        {
            return "Scheduler:HeartbeatSeconds en az 5 olmalı ve LeaseSeconds değerinin üçte birini aşmamalıdır.";
        }

        if (o.MaxRunMinutes is < 1 or > 180)
        {
            return "Scheduler:MaxRunMinutes 1 ile 180 arasında olmalıdır.";
        }

        if (o.CompleteMinGapMinutes is < 0 or > 120 || o.PublishWaitMaxMinutes is < 0 or > 120)
        {
            return "Scheduler:CompleteMinGapMinutes ve PublishWaitMaxMinutes 0 ile 120 arasında olmalıdır.";
        }

        if (o.DelayBetweenAiCallsSeconds is < 0 or > 120)
        {
            return "Scheduler:DelayBetweenAiCallsSeconds 0 ile 120 arasında olmalıdır.";
        }

        if (o.MaxTimerAttemptsPerDay is < 1 or > 10 || o.RetryDelayMinutes is < 1 or > 120)
        {
            return "Scheduler:MaxTimerAttemptsPerDay 1-10, RetryDelayMinutes 1-120 arasında olmalıdır.";
        }

        if (o.MaxSlotsPerLesson is < 1 or > 20)
        {
            return "Scheduler:MaxSlotsPerLesson 1 ile 20 arasında olmalıdır.";
        }

        if (o.StartupDelaySeconds is < 0 or > 600)
        {
            return "Scheduler:StartupDelaySeconds 0 ile 600 arasında olmalıdır.";
        }

        if (o.FakeGenerator.DelayMs is < 0 or > 60000 || FakeGeneratorOptions.ParseSlots(o.FakeGenerator.FailSlots) is null)
        {
            return "Scheduler:FakeGenerator ayarları geçersiz (FailSlots 1-20 arası virgülle ayrılmış sayılar, DelayMs 0-60000).";
        }

        if (o.UseFakeGenerator && !isDevelopment)
        {
            return "Scheduler:UseFakeGenerator yalnızca Development ortamında açılabilir.";
        }

        return null;
    }
}

public sealed class SchedulerOptionsValidator(IHostEnvironment environment) : IValidateOptions<SchedulerOptions>
{
    public ValidateOptionsResult Validate(string? name, SchedulerOptions options) =>
        SchedulerOptions.Validate(options, environment.IsDevelopment()) is { } message
            ? ValidateOptionsResult.Fail(message)
            : ValidateOptionsResult.Success;
}

public static class SchedulerOptionsExtensions
{
    public static IServiceCollection AddSchedulerOptions(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<IValidateOptions<SchedulerOptions>, SchedulerOptionsValidator>();
        services.AddOptions<SchedulerOptions>().Bind(configuration.GetSection(SchedulerOptions.SectionName)).ValidateOnStart();
        return services;
    }
}
