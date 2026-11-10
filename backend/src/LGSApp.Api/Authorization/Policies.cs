namespace LGSApp.Api.Authorization;

public static class Policies
{
    public const string MudurOnly = "MudurOnly";
    public const string OgretmenOrMudur = "OgretmenOrMudur";
    public const string OgrenciOnly = "OgrenciOnly";
    public const string AiService = "AiService";
    public const string AuthenticatedAllowPasswordChange = "AuthenticatedAllowPasswordChange";
}
