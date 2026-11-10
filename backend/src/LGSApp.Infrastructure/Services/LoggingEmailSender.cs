using Microsoft.Extensions.Logging;

namespace LGSApp.Infrastructure.Services;

public class LoggingEmailSender : IAppEmailSender
{
    private readonly ILogger<LoggingEmailSender> _logger;

    public LoggingEmailSender(ILogger<LoggingEmailSender> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("E-posta (gelistirme) Alici: {To} Konu: {Subject} Icerik: {Body}", toEmail, subject, body);
        return Task.CompletedTask;
    }
}
