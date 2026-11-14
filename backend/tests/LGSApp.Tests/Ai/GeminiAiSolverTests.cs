using System.Net;
using System.Text.Json;
using LGSApp.Domain.Entities;
using LGSApp.Infrastructure.Services.Ai;
using Microsoft.Extensions.Time.Testing;
using Options = Microsoft.Extensions.Options.Options;

namespace LGSApp.Tests.Ai;

public class GeminiAiSolverTests
{
    private const string Description = "Ben ikinci adımda takıldım çünkü payda eşitlemeyi unuttum";

    private static (GeminiAiSolver Solver, StubHandler Handler) Create()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 14, 12, 0, 0, TimeSpan.Zero));
        var handler = new StubHandler(clock);
        var options = AiTestData.GeminiOptions();
        var client = AiTestData.CreateClient(handler, clock, options);
        return (new GeminiAiSolver(client, Options.Create(options), new AiProviderGate(clock, Options.Create(options))), handler);
    }

    private static AiSolveInput Input(byte[]? image = null, int? verified = null) =>
        new("Matematik", "Üslü Sayılar", "2 üzeri 3 kaçtır?", "6", "8", "9", "12", image, verified);

    private static string Payload(string answer = "B", bool readable = true, string confidence = "high", bool? agrees = null)
    {
        var agreesPart = agrees is null ? string.Empty : $"\"agreesWithKey\":{(agrees.Value ? "true" : "false")},";
        return "{" + agreesPart + $"\"readable\":{(readable ? "true" : "false")},\"answer\":\"{answer}\",\"confidence\":\"{confidence}\",\"solution\":\"{new string('s', 70)}\"" + "}";
    }

    [Fact]
    public async Task Blind_request_has_image_schema_and_no_answer_key()
    {
        var (solver, handler) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload()));
        var image = new byte[] { 9, 8, 7, 6, 5 };

        var result = await solver.SolveAsync(42, Input(image, verified: 3), AiSolveMode.Blind, CancellationToken.None);

        Assert.True(result.Succeeded);
        var sent = Assert.Single(handler.Requests);
        using var body = JsonDocument.Parse(sent.Body);
        var parts = body.RootElement.GetProperty("contents")[0].GetProperty("parts");
        Assert.Equal("image/jpeg", parts[1].GetProperty("inlineData").GetProperty("mimeType").GetString());
        Assert.Equal(Convert.ToBase64String(image), parts[1].GetProperty("inlineData").GetProperty("data").GetString());
        var prompt = parts[0].GetProperty("text").GetString()!;
        Assert.DoesNotContain("doğrulanmış cevabı", prompt);
        Assert.DoesNotContain("agreesWithKey", sent.Body);
        Assert.Contains("Soruyu adım adım çöz.", prompt);
        var schema = body.RootElement.GetProperty("generationConfig").GetProperty("responseJsonSchema");
        Assert.False(schema.GetProperty("properties").TryGetProperty("agreesWithKey", out _));
        Assert.Equal(AiTestData.SolutionKey, sent.Headers["x-goog-api-key"]);
    }

    [Fact]
    public async Task Verified_request_contains_the_key_letter_and_agreement_schema()
    {
        var (solver, handler) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload(answer: "C", agrees: true)));

        var result = await solver.SolveAsync(42, Input(verified: 3), AiSolveMode.Verified, CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.True(result.AgreesWithKey);
        Assert.Equal(3, result.Answer);
        var sent = Assert.Single(handler.Requests);
        using var body = JsonDocument.Parse(sent.Body);
        var parts = body.RootElement.GetProperty("contents")[0].GetProperty("parts");
        var prompt = parts[0].GetProperty("text").GetString()!;
        Assert.Contains("doğrulanmış cevabı C şıkkıdır", prompt);
        Assert.True(body.RootElement.GetProperty("generationConfig").GetProperty("responseJsonSchema").GetProperty("properties").TryGetProperty("agreesWithKey", out _));
        Assert.Equal(1, parts.GetArrayLength());
    }

    [Fact]
    public async Task Request_carries_no_personal_data_or_identifiers()
    {
        var (solver, handler) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload()));
        var input = new AiSolveInput("Matematik", "Üslü Sayılar", "2 üzeri 3 kaçtır?", "6", "8", "9", "12", [1, 2, 3], null);

        await solver.SolveAsync(987654, input, AiSolveMode.Blind, CancellationToken.None);

        var body = Assert.Single(handler.Requests).Body;
        Assert.DoesNotContain("ogrenci.test", body);
        Assert.DoesNotContain("yapay.zeka", body);
        Assert.DoesNotContain(Description, body);
        Assert.DoesNotContain("987654", body);
        Assert.DoesNotContain("Ahmet", body);
        var names = typeof(AiSolveInput).GetProperties().Select(p => p.Name).ToList();
        Assert.DoesNotContain(names, n => n.Contains("User", StringComparison.OrdinalIgnoreCase) || n.Contains("Description", StringComparison.OrdinalIgnoreCase) || n.EndsWith("Id", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Verified_mode_without_a_key_is_rejected_before_any_call()
    {
        var (solver, handler) = Create();

        await Assert.ThrowsAsync<ArgumentException>(() => solver.SolveAsync(1, Input(), AiSolveMode.Verified, CancellationToken.None));

        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task Readable_false_and_none_answer_are_parsed()
    {
        var (solver, handler) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload(answer: "NONE", readable: false, confidence: "low")));

        var result = await solver.SolveAsync(1, Input(), AiSolveMode.Blind, CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.False(result.Readable);
        Assert.Equal(0, result.Answer);
    }

    [Theory]
    [InlineData("{\"readable\":true,\"answer\":\"E\",\"confidence\":\"high\",\"solution\":\"x\"}")]
    [InlineData("{\"readable\":true,\"answer\":\"A\",\"confidence\":\"certain\",\"solution\":\"x\"}")]
    [InlineData("{\"readable\":true,\"answer\":\"A\",\"confidence\":\"high\"}")]
    [InlineData("[1,2]")]
    [InlineData("düz metin")]
    public async Task Malformed_payloads_become_invalid_output(string payload)
    {
        var (solver, handler) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(payload));

        var result = await solver.SolveAsync(1, Input(), AiSolveMode.Blind, CancellationToken.None);

        Assert.Equal(AiErrorKind.InvalidOutput, result.ErrorKind);
        Assert.False(result.ErrorKind.IsProviderFailure());
    }

    [Fact]
    public async Task Verified_payload_without_agreement_field_is_invalid()
    {
        var (solver, handler) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload(answer: "C")));

        var result = await solver.SolveAsync(1, Input(verified: 3), AiSolveMode.Verified, CancellationToken.None);

        Assert.Equal(AiErrorKind.InvalidOutput, result.ErrorKind);
    }

    [Fact]
    public async Task Provider_errors_surface_with_their_kind()
    {
        var (solver, handler) = Create();
        handler.EnqueueJson(HttpStatusCode.Unauthorized, "{\"error\":{\"code\":401,\"message\":\"bad key\"}}");

        var result = await solver.SolveAsync(1, Input(), AiSolveMode.Blind, CancellationToken.None);

        Assert.Equal(AiErrorKind.AuthFailed, result.ErrorKind);
        Assert.True(result.ErrorKind.IsProviderFailure());
    }

    [Fact]
    public async Task Tokens_and_model_are_copied_to_the_result()
    {
        var (solver, handler) = Create();
        handler.EnqueueJson(HttpStatusCode.OK, AiTestData.SuccessBody(Payload(), input: 321, output: 45, thoughts: 67));

        var result = await solver.SolveAsync(1, Input(), AiSolveMode.Blind, CancellationToken.None);

        Assert.Equal(321, result.InputTokens);
        Assert.Equal(45, result.OutputTokens);
        Assert.Equal(67, result.ThinkingTokens);
        Assert.Equal("gemini-3.8-flash", result.Model);
        Assert.Equal("gemini-3.8-flash-001", result.ModelVersion);
    }
}
