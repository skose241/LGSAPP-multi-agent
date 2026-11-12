namespace LGSApp.Infrastructure.Services.Common;

public enum ServiceErrorKind
{
    None = 0,
    NotFound = 1,
    Forbidden = 2,
    Conflict = 3,
    Validation = 4
}

public interface IServiceResult
{
    ServiceErrorKind Error { get; }
    string? Message { get; }
    IReadOnlyDictionary<string, string[]>? Errors { get; }
    bool Succeeded { get; }
}

public readonly record struct Failure(ServiceErrorKind Kind, string Message, IReadOnlyDictionary<string, string[]>? Errors = null);

public static class Fail
{
    public static Failure NotFound(string message) => new(ServiceErrorKind.NotFound, message);
    public static Failure Forbidden(string message) => new(ServiceErrorKind.Forbidden, message);
    public static Failure Conflict(string message) => new(ServiceErrorKind.Conflict, message);
    public static Failure Validation(string message) => new(ServiceErrorKind.Validation, message);
    public static Failure Validation(string message, IReadOnlyDictionary<string, string[]> errors) => new(ServiceErrorKind.Validation, message, errors);
}

public sealed class ServiceResult : IServiceResult
{
    private ServiceResult(ServiceErrorKind error, string? message, IReadOnlyDictionary<string, string[]>? errors)
    {
        Error = error;
        Message = message;
        Errors = errors;
    }

    public ServiceErrorKind Error { get; }
    public string? Message { get; }
    public IReadOnlyDictionary<string, string[]>? Errors { get; }
    public bool Succeeded => Error == ServiceErrorKind.None;

    public static ServiceResult Ok() => new(ServiceErrorKind.None, null, null);

    public static implicit operator ServiceResult(Failure failure) => new(failure.Kind, failure.Message, failure.Errors);
}

public sealed class ServiceResult<T> : IServiceResult
{
    private ServiceResult(T? value, ServiceErrorKind error, string? message, IReadOnlyDictionary<string, string[]>? errors)
    {
        Value = value;
        Error = error;
        Message = message;
        Errors = errors;
    }

    public T? Value { get; }
    public ServiceErrorKind Error { get; }
    public string? Message { get; }
    public IReadOnlyDictionary<string, string[]>? Errors { get; }
    public bool Succeeded => Error == ServiceErrorKind.None;

    public static ServiceResult<T> Ok(T value) => new(value, ServiceErrorKind.None, null, null);

    public static ServiceResult<T> From(IServiceResult failed) => new(default, failed.Error, failed.Message, failed.Errors);

    public static implicit operator ServiceResult<T>(Failure failure) => new(default, failure.Kind, failure.Message, failure.Errors);
}
