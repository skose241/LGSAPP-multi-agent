using LGSApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LGSApp.Infrastructure.Persistence.Configurations;

public class QuestionLikeConfiguration : IEntityTypeConfiguration<QuestionLike>
{
    public void Configure(EntityTypeBuilder<QuestionLike> b)
    {
        b.ToTable("QuestionLikes");
        b.HasKey(x => new { x.QuestionId, x.UserId });
        b.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        b.RestrictTo<QuestionLike, Question>(x => x.QuestionId);
        b.RestrictToUser<QuestionLike>(x => x.UserId);
    }
}
