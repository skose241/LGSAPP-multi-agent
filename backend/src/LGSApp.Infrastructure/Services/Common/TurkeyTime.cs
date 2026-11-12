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

    private static TimeZoneInfo Resolve()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Turkey Standard Time");
        }
    }
}
