using System.ComponentModel.DataAnnotations;
using LGSApp.Domain.Constants;

namespace LGSApp.Api.Dtos;

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class CommentBodyAttribute : ValidationAttribute
{
    public CommentBodyAttribute()
        : base(CommentRules.EmptyBodyMessage)
    {
    }

    public override bool IsValid(object? value) =>
        value is string body && CommentRules.Normalize(body).Length > 0;
}
