using LGSApp.Domain.Constants;

namespace LGSApp.Infrastructure.Services.Common;

public sealed record Actor(int UserId, string Role)
{
    public bool IsMudur => Role == Roles.Mudur;
    public bool IsTeacher => Role == Roles.Ogretmen;
    public bool IsStudent => Role == Roles.Ogrenci;
    public bool IsModerator => IsMudur || IsTeacher;
}
