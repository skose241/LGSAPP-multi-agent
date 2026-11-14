using System.Text;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Scheduler;

namespace LGSApp.Tests.Ai;

public class AnswerBalancerTests
{
    [Fact]
    public void Empty_history_uses_fallback()
    {
        Assert.Equal(3, AnswerBalancer.PickTarget([], 3));
        Assert.Equal(1, AnswerBalancer.PickTarget([], 9));
    }

    [Fact]
    public void Least_used_letter_is_picked()
    {
        Assert.Equal(4, AnswerBalancer.PickTarget([1, 2, 3, 1, 2, 3, 1], 1));
        Assert.Equal(2, AnswerBalancer.PickTarget([1, 1, 3, 3, 4, 4, 1, 3], 1));
    }

    [Fact]
    public void Ties_prefer_the_letter_used_longest_ago_or_never()
    {
        Assert.Equal(1, AnswerBalancer.PickTarget([2, 3, 4, 1], 1));
        Assert.Equal(4, AnswerBalancer.PickTarget([2, 3, 1], 1));
    }

    [Fact]
    public void Only_the_latest_twenty_count()
    {
        var window = Enumerable.Range(0, 5).SelectMany(_ => new[] { 1, 2, 3, 4 }).ToList();
        var history = window.Concat(Enumerable.Repeat(4, 30)).ToList();

        Assert.Equal(4, AnswerBalancer.PickTarget(window, 1));
        Assert.Equal(4, AnswerBalancer.PickTarget(history, 1));
    }
}

public class TextSimilarityTests
{
    [Fact]
    public void Identical_texts_score_one()
    {
        Assert.Equal(1.0, TextSimilarity.Jaccard("Ali her gün beş sayfa kitap okuyor", "Ali her gün beş sayfa kitap okuyor"));
    }

    [Fact]
    public void Disjoint_texts_score_zero()
    {
        Assert.Equal(0.0, TextSimilarity.Jaccard("Ali her gün beş sayfa kitap okuyor", "Bir dikdörtgenin çevresi yirmi santimetredir"));
    }

    [Fact]
    public void Case_punctuation_and_turkish_dotted_i_are_ignored()
    {
        Assert.Equal(1.0, TextSimilarity.Jaccard("İSTANBUL'DA yağmur yağıyor, kaç mm?", "istanbul'da YAĞMUR yağıyor kaç mm"));
    }

    [Fact]
    public void Partial_overlap_is_between_zero_and_one()
    {
        var score = TextSimilarity.Jaccard("bir iki üç dört beş altı yedi", "bir iki üç dört beş sekiz dokuz");
        Assert.InRange(score, 0.3, 0.5);
    }

    [Fact]
    public void Empty_input_scores_zero()
    {
        Assert.Equal(0.0, TextSimilarity.Jaccard("", "bir iki üç"));
    }
}

public class AiQuestionValidatorExtendedTests
{
    private static QuestionGenerationResult Valid() => new(
        true,
        "Bir kutuda 12 kırmızı ve 8 mavi bilye vardır. Rastgele çekilen bilyenin kırmızı olma olasılığı kaçtır?",
        "2/5",
        "3/5",
        "1/2",
        "3/4",
        2,
        new string('a', 60),
        Topic: "Olasılık");

    [Fact]
    public void Options_equal_after_turkish_lowercase_and_whitespace_are_rejected()
    {
        var result = AiQuestionValidator.Check(Valid() with { OptionA = "IŞIK  hızı", OptionB = "ışık hızı" }, null, null);

        Assert.Null(result.Value);
        Assert.NotNull(result.Error);
    }

    [Fact]
    public void Decomposed_and_composed_forms_count_as_the_same_option()
    {
        var composed = "çay";
        var decomposed = "çay";
        var result = AiQuestionValidator.Check(Valid() with { OptionA = composed, OptionC = decomposed }, null, null);

        Assert.Null(result.Value);
    }

    [Fact]
    public void Output_is_nfc()
    {
        var decomposed = "çay ve şeker";
        var result = AiQuestionValidator.Check(Valid() with { OptionD = decomposed }, null, null);

        Assert.Equal(decomposed.Normalize(NormalizationForm.FormC), result.Value!.OptionD);
    }

    [Theory]
    [InlineData("**kalın** metin")]
    [InlineData("kod ```x``` bloğu")]
    [InlineData("# Başlık\nmetin")]
    public void Markdown_is_rejected_in_text_options_and_explanation(string markdown)
    {
        Assert.NotNull(AiQuestionValidator.Check(Valid() with { Text = markdown + " soru kaç olur acaba" }, null, null).Error);
        Assert.NotNull(AiQuestionValidator.Check(Valid() with { OptionB = markdown }, null, null).Error);
        Assert.NotNull(AiQuestionValidator.Check(Valid() with { Explanation = markdown + new string('x', 60) }, null, null).Error);
    }

    [Fact]
    public void Hash_inside_a_line_is_not_markdown()
    {
        Assert.Null(AiQuestionValidator.Check(Valid() with { OptionA = "No. 5 # ev" }, null, null).Error);
    }

    [Fact]
    public void Too_similar_to_a_recent_question_is_rejected()
    {
        var recent = new[] { "Bir kutuda 12 kırmızı ve 8 mavi bilye vardır. Rastgele çekilen bilyenin kırmızı olma olasılığı kaçtır?" };

        var result = AiQuestionValidator.Check(Valid(), recent, null);

        Assert.Null(result.Value);
        Assert.Equal("Son sorulara çok benzer.", result.Error);
    }

    [Fact]
    public void Different_recent_questions_pass()
    {
        var result = AiQuestionValidator.Check(Valid(), ["Bir dikdörtgenin kısa kenarı 5 cm, uzun kenarı 9 cm ise çevresi kaç santimetredir?"], null);

        Assert.NotNull(result.Value);
    }

    [Fact]
    public void Only_the_five_latest_recent_questions_are_compared()
    {
        var recent = Enumerable.Range(0, 5).Select(i => $"Tamamen farklı {i} numaralı eski soru metni burada yer alır").Append(Valid().Text!).ToList();

        Assert.NotNull(AiQuestionValidator.Check(Valid(), recent, null).Value);
    }

    [Fact]
    public void Topic_mismatch_is_only_a_warning()
    {
        var result = AiQuestionValidator.Check(Valid() with { Topic = "Geometri" }, null, "Olasılık");

        Assert.NotNull(result.Value);
        Assert.Single(result.Warnings);
    }

    [Fact]
    public void Matching_or_containing_topic_has_no_warning()
    {
        Assert.Empty(AiQuestionValidator.Check(Valid() with { Topic = "olasılık" }, null, "Olasılık").Warnings);
        Assert.Empty(AiQuestionValidator.Check(Valid() with { Topic = "Basit Olasılık Hesapları" }, null, "Olasılık").Warnings);
        Assert.Empty(AiQuestionValidator.Check(Valid() with { Topic = null }, null, "Olasılık").Warnings);
    }
}

public class GenerationCircuitBreakerTests
{
    [Theory]
    [InlineData(AiErrorKind.QuotaExhausted, true)]
    [InlineData(AiErrorKind.AuthFailed, true)]
    [InlineData(AiErrorKind.NotConfigured, true)]
    [InlineData(AiErrorKind.RateLimited, false)]
    [InlineData(AiErrorKind.Unavailable, false)]
    [InlineData(AiErrorKind.InvalidOutput, false)]
    [InlineData(AiErrorKind.None, false)]
    public void Only_permanent_failures_trip(AiErrorKind kind, bool trips)
    {
        var breaker = new GenerationCircuitBreaker();

        breaker.Observe(kind);

        Assert.Equal(trips, breaker.Tripped);
    }

    [Fact]
    public void First_tripping_kind_is_kept_and_messages_are_turkish()
    {
        var breaker = new GenerationCircuitBreaker();
        breaker.Observe(AiErrorKind.Timeout);
        Assert.Null(breaker.Message);

        breaker.Observe(AiErrorKind.QuotaExhausted);
        breaker.Observe(AiErrorKind.AuthFailed);

        Assert.Equal("Yapay zekâ günlük kotası doldu.", breaker.Message);
        Assert.Equal("Yapay zekâ anahtarı geçersiz.", SchedulerMessages.ForErrorKind(AiErrorKind.AuthFailed, null));
        Assert.Equal("Yapay zekâ yapılandırılmadı.", SchedulerMessages.ForErrorKind(AiErrorKind.NotConfigured, null));
    }
}
