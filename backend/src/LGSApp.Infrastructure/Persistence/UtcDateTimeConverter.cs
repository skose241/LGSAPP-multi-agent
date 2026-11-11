using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace LGSApp.Infrastructure.Persistence;

public sealed class UtcDateTimeConverter : ValueConverter<DateTime, DateTime>
{
    public UtcDateTimeConverter()
        : base(v => ToStore(v), v => DateTime.SpecifyKind(v, DateTimeKind.Utc))
    {
    }

    private static DateTime ToStore(DateTime value) => value.Kind switch
    {
        DateTimeKind.Local => value.ToUniversalTime(),
        DateTimeKind.Unspecified => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        _ => value
    };
}

public sealed class NullableUtcDateTimeConverter : ValueConverter<DateTime?, DateTime?>
{
    public NullableUtcDateTimeConverter()
        : base(v => ToStore(v), v => ToModel(v))
    {
    }

    private static DateTime? ToStore(DateTime? value) => value.HasValue
        ? value.Value.Kind switch
        {
            DateTimeKind.Local => value.Value.ToUniversalTime(),
            DateTimeKind.Unspecified => DateTime.SpecifyKind(value.Value, DateTimeKind.Utc),
            _ => value.Value
        }
        : null;

    private static DateTime? ToModel(DateTime? value) => value.HasValue
        ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc)
        : null;
}
