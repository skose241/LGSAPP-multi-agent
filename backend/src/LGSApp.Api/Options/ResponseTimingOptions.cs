namespace LGSApp.Api.Options;

public class ResponseTimingOptions
{
    public const string SectionName = "ResponseTiming";

    public int LoginFailureMinMilliseconds { get; set; } = 400;
    public int ForgotPasswordMinMilliseconds { get; set; } = 300;
    public int RecoverMinMilliseconds { get; set; } = 700;
}
