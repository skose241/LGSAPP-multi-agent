using LGSApp.Infrastructure.Options;
using LGSApp.Infrastructure.Services.Common;
using LGSApp.Infrastructure.Services.Scheduler;

namespace LGSApp.Tests;

public class SlotPlannerTests
{
    [Theory]
    [InlineData(null, 2, 1, 20, 2)]
    [InlineData(null, 3, 2, 20, 6)]
    [InlineData(null, 0, 5, 20, 0)]
    [InlineData(null, 15, 3, 20, 20)]
    [InlineData(4, 1, 1, 20, 4)]
    [InlineData(0, 3, 1, 20, 0)]
    [InlineData(10, 1, 1, 5, 5)]
    public void Target_uses_plan_override_or_schedule_times_multiplier_capped(int? plan, int schedule, int multiplier, int max, int expected)
    {
        Assert.Equal(expected, SlotPlanner.Target((byte?)plan, schedule, multiplier, max));
    }

    [Fact]
    public void Missing_slots_are_the_gaps_in_one_to_target()
    {
        Assert.Equal<byte>([2, 4], SlotPlanner.MissingSlots(4, [1, 3]));
        Assert.Empty(SlotPlanner.MissingSlots(2, [1, 2, 3]));
        Assert.Empty(SlotPlanner.MissingSlots(0, []));
    }
}

public class TopicResolverTests
{
    [Fact]
    public void Today_topic_wins_over_everything()
    {
        var choice = TopicResolver.Resolve(1, 2, 3, 4);
        Assert.Equal(new TopicChoice(1, TopicSource.Today), choice);
    }

    [Fact]
    public void Plan_then_last_used_then_first_active()
    {
        Assert.Equal(new TopicChoice(2, TopicSource.Plan), TopicResolver.Resolve(null, 2, 3, 4));
        Assert.Equal(new TopicChoice(3, TopicSource.LastUsed), TopicResolver.Resolve(null, null, 3, 4));
        Assert.Equal(new TopicChoice(4, TopicSource.First), TopicResolver.Resolve(null, null, null, 4));
    }

    [Fact]
    public void No_topic_yields_none()
    {
        Assert.Equal(new TopicChoice(null, TopicSource.None), TopicResolver.Resolve(null, null, null, null));
    }
}

public class AiQuestionValidatorTests
{
    private static QuestionGenerationResult Valid() => new(
        true,
        "Soru metni",
        "A seçeneği",
        "B seçeneği",
        "C seçeneği",
        "D seçeneği",
        3,
        new string('a', 60));

    [Fact]
    public void Valid_result_passes_and_is_trimmed()
    {
        var (question, error) = AiQuestionValidator.Validate(Valid() with { Text = "  Soru  " });

        Assert.Null(error);
        Assert.Equal("Soru", question!.Text);
        Assert.Equal(3, question.CorrectOption);
    }

    [Fact]
    public void Text_is_normalized_to_nfc()
    {
        var decomposed = "İ";
        var (question, _) = AiQuestionValidator.Validate(Valid() with { Text = "Ş̧ " + decomposed });

        Assert.Equal(question!.Text, question.Text.Normalize(System.Text.NormalizationForm.FormC));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Empty_text_is_rejected(string? text)
    {
        Assert.NotNull(AiQuestionValidator.Validate(Valid() with { Text = text }).Error);
    }

    [Fact]
    public void Text_over_limit_is_rejected()
    {
        Assert.NotNull(AiQuestionValidator.Validate(Valid() with { Text = new string('x', 8001) }).Error);
    }

    [Fact]
    public void Empty_or_long_option_is_rejected()
    {
        Assert.NotNull(AiQuestionValidator.Validate(Valid() with { OptionC = " " }).Error);
        Assert.NotNull(AiQuestionValidator.Validate(Valid() with { OptionD = new string('x', 501) }).Error);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(5)]
    public void Correct_option_must_be_one_to_four(int option)
    {
        Assert.NotNull(AiQuestionValidator.Validate(Valid() with { CorrectOption = option }).Error);
    }

    [Fact]
    public void Short_explanation_is_rejected()
    {
        Assert.NotNull(AiQuestionValidator.Validate(Valid() with { Explanation = new string('a', 49) }).Error);
        Assert.Null(AiQuestionValidator.Validate(Valid() with { Explanation = new string('a', 50) }).Error);
    }

    [Fact]
    public void Solution_text_has_expected_prefix()
    {
        Assert.StartsWith("Doğru cevap: B şıkkı.", AiQuestionValidator.BuildSolutionText(2, "açıklama"));
    }
}

public class TurkeyTimeTests
{
    [Fact]
    public void Utc_plus_three_conversions_round_trip()
    {
        var utc = TurkeyTime.ToUtc(new DateOnly(2026, 11, 12), new TimeOnly(17, 30));

        Assert.Equal(new DateTime(2026, 11, 12, 14, 30, 0, DateTimeKind.Utc), utc);
        Assert.Equal(new DateTime(2026, 11, 12, 17, 30, 0), TurkeyTime.ToLocal(utc));
    }

    [Fact]
    public void Local_date_rolls_over_at_local_midnight()
    {
        Assert.Equal(new DateOnly(2026, 11, 13), TurkeyTime.ToLocalDate(new DateTime(2026, 11, 12, 21, 0, 0, DateTimeKind.Utc)));
        Assert.Equal(new DateOnly(2026, 11, 12), TurkeyTime.ToLocalDate(new DateTime(2026, 11, 12, 20, 59, 0, DateTimeKind.Utc)));
    }

    [Theory]
    [InlineData(2026, 11, 9, 1)]
    [InlineData(2026, 11, 12, 4)]
    [InlineData(2026, 11, 15, 7)]
    public void Iso_day_of_week_is_monday_based(int year, int month, int day, int expected)
    {
        Assert.Equal(expected, TurkeyTime.IsoDayOfWeek(new DateOnly(year, month, day)));
    }

    [Fact]
    public void Resolve_uses_first_id_when_available()
    {
        var calls = new List<string>();
        var zone = TurkeyTime.Resolve(id =>
        {
            calls.Add(id);
            return TimeZoneInfo.CreateCustomTimeZone(id, TimeSpan.FromHours(5), id, id);
        });

        Assert.Equal(["Europe/Istanbul"], calls);
        Assert.Equal("Europe/Istanbul", zone.Id);
    }

    [Fact]
    public void Resolve_falls_back_to_second_id()
    {
        var calls = new List<string>();
        var zone = TurkeyTime.Resolve(id =>
        {
            calls.Add(id);
            return id == "Europe/Istanbul"
                ? throw new InvalidTimeZoneException()
                : TimeZoneInfo.CreateCustomTimeZone(id, TimeSpan.FromHours(3), id, id);
        });

        Assert.Equal(["Europe/Istanbul", "Turkey Standard Time"], calls);
        Assert.Equal("Turkey Standard Time", zone.Id);
    }

    [Fact]
    public void Resolve_falls_back_to_fixed_offset_when_lookup_always_fails()
    {
        var zone = TurkeyTime.Resolve(id => throw new TimeZoneNotFoundException(id));

        Assert.Equal(TimeSpan.FromHours(3), zone.BaseUtcOffset);
        Assert.False(zone.SupportsDaylightSavingTime);
        var utc = new DateTime(2026, 11, 12, 21, 0, 0, DateTimeKind.Utc);
        Assert.Equal(new DateOnly(2026, 11, 13), DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utc, zone)));
        var local = DateTime.SpecifyKind(new DateTime(2026, 7, 1, 17, 30, 0), DateTimeKind.Unspecified);
        Assert.Equal(new DateTime(2026, 7, 1, 14, 30, 0, DateTimeKind.Utc), TimeZoneInfo.ConvertTimeToUtc(local, zone));
    }

    [Fact]
    public void Fake_time_provider_drives_clock()
    {
        var provider = new Microsoft.Extensions.Time.Testing.FakeTimeProvider(new DateTimeOffset(2026, 11, 12, 21, 30, 0, TimeSpan.Zero));
        var clock = new TurkeyTime(provider);

        Assert.Equal(new DateOnly(2026, 11, 13), clock.Today);
        Assert.Equal(0, clock.LocalNow.Hour);
    }
}

public class SchedulerOptionsTests
{
    [Fact]
    public void Defaults_are_valid()
    {
        Assert.Null(SchedulerOptions.Validate(new SchedulerOptions(), false));
    }

    [Fact]
    public void Time_order_is_enforced()
    {
        Assert.NotNull(SchedulerOptions.Validate(new SchedulerOptions { CompleteAt = "17:00" }, false));
    }

    [Fact]
    public void Invalid_time_is_rejected()
    {
        Assert.NotNull(SchedulerOptions.Validate(new SchedulerOptions { PublishAt = "25:00" }, false));
    }

    [Fact]
    public void Heartbeat_must_be_at_most_a_third_of_lease()
    {
        Assert.NotNull(SchedulerOptions.Validate(new SchedulerOptions { HeartbeatSeconds = 90 }, false));
    }

    [Fact]
    public void Fake_generator_is_development_only()
    {
        var options = new SchedulerOptions { UseFakeGenerator = true };

        Assert.NotNull(SchedulerOptions.Validate(options, false));
        Assert.Null(SchedulerOptions.Validate(options, true));
    }

    [Fact]
    public void Fake_fail_slots_must_be_numbers()
    {
        var options = new SchedulerOptions { FakeGenerator = new FakeGeneratorOptions { FailSlots = "1,x" } };

        Assert.NotNull(SchedulerOptions.Validate(options, true));
        Assert.Equal([1, 2], new FakeGeneratorOptions { FailSlots = "2, 1" }.FailSlotSet.Order());
    }
}
