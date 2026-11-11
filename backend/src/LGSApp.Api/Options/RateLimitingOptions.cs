namespace LGSApp.Api.Options;

public class RateLimitRule
{
    public int PermitLimit { get; set; }
    public int WindowSeconds { get; set; }
}

public class RateLimitingOptions
{
    public const string SectionName = "RateLimiting";

    public RateLimitRule Login { get; set; } = new() { PermitLimit = 10, WindowSeconds = 60 };
    public RateLimitRule ForgotPassword { get; set; } = new() { PermitLimit = 5, WindowSeconds = 300 };
    public RateLimitRule CommentWrite { get; set; } = new() { PermitLimit = 6, WindowSeconds = 60 };
    public RateLimitRule AnswerSubmit { get; set; } = new() { PermitLimit = 10, WindowSeconds = 60 };
    public RateLimitRule ReportCreate { get; set; } = new() { PermitLimit = 5, WindowSeconds = 60 };
}
