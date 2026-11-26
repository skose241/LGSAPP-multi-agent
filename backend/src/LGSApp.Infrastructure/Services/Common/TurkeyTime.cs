namespace LGSApp.Infrastructure.Services.Common;

public sealed class TurkeyTime(TimeProvider timeProvider)
{
    private static readonly TimeZoneInfo Zone = Resolve();

    public DateTime UtcNow => timeProvider.GetUtcNow().UtcDateTime;

    public DateOnly Today => ToLocalDate(UtcNow);

    public DateTime LocalNow => ToLocal(UtcNow);

    public static DateTime ToLocal(DateTime utc)
    {
        var normalized = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
        return TimeZoneInfo.ConvertTimeFromUtc(normalized, Zone);
    }

    public static int IsoDayOfWeek(DateOnly date)
    {
        var day = (int)date.DayOfWeek;
        return day == 0 ? 7 : day;
    }

    public static DateOnly ToLocalDate(DateTime utc)
    {
        var normalized = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(normalized, Zone));
    }

    public static DateTime ToUtc(DateOnly date, TimeOnly time)
    {
        var local = DateTime.SpecifyKind(date.ToDateTime(time), DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(local, Zone);
    }

    private static TimeZoneInfo Resolve() => Resolve(TimeZoneInfo.FindSystemTimeZoneById);

    public static TimeZoneInfo Resolve(Func<string, TimeZoneInfo> lookup)
    {
        foreach (var id in new[] { "Europe/Istanbul", "Turkey Standard Time" })
        {
            try
            {
                return lookup(id);
            }
            catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.CreateCustomTimeZone("Europe/Istanbul", TimeSpan.FromHours(3), "Turkey Time", "Turkey Time");
    }
}
