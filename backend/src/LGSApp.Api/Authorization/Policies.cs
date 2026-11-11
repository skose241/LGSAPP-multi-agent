namespace LGSApp.Api.Authorization;

public static class Policies
{
    public const string Kullanici = "Kullanici";
    public const string MudurOnly = "MudurOnly";
    public const string OgretmenOrMudur = "OgretmenOrMudur";
    public const string OgrenciOnly = "OgrenciOnly";
    public const string AuthenticatedAllowPasswordChange = "AuthenticatedAllowPasswordChange";
}
