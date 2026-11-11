using System.Linq.Expressions;
using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

internal static class ConfigurationExtensions
{
    public static void RestrictTo<TDependent, TPrincipal>(this EntityTypeBuilder<TDependent> builder, Expression<Func<TDependent, object?>> foreignKey)
        where TDependent : class
        where TPrincipal : class
    {
        builder.HasOne<TPrincipal>().WithMany().HasForeignKey(foreignKey).OnDelete(DeleteBehavior.Restrict);
    }

    public static void RestrictToUser<TDependent>(this EntityTypeBuilder<TDependent> builder, Expression<Func<TDependent, object?>> foreignKey)
        where TDependent : class
    {
        builder.RestrictTo<TDependent, ApplicationUser>(foreignKey);
    }
}
