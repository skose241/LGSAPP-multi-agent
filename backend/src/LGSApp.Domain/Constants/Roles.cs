namespace LGSApp.Domain.Constants;

public static class Roles
{
    public const string Mudur = "mudur";
    public const string Ogretmen = "ogretmen";
    public const string Ogrenci = "ogrenci";
    public const string Ai = "ai";

    public const int MudurId = 1;
    public const int OgretmenId = 2;
    public const int OgrenciId = 3;
    public const int AiId = 4;

    public static readonly string[] All = [Mudur, Ogretmen, Ogrenci, Ai];
}
