namespace LGSApp.Infrastructure.Services.Ai;

public static class AiMessages
{
    public const string GateQuotaExhausted = "Günlük Gemini kotası doldu; kota yenilenene kadar çağrı yapılmıyor.";
    public const string GateAuthFailed = "Yapay zekâ anahtarı geçersiz; bekleme süresi dolana kadar çağrı yapılmıyor.";
    public const string NotConfigured = "Yapay zekâ yapılandırılmadı.";
    public const string SolutionUnavailable = "Yapay zekâ çözümü şu anda kullanılamıyor.";
    public const string SolutionRemoved = "Bu sorunun yapay zekâ çözümü kaldırılmış.";
    public const string UnderReview = "Yapay zekâ bu soruda cevap anahtarından farklı bir sonuca ulaştı; soru öğretmen incelemesinde.";
    public const string Unreadable = "Soru görseli net okunamadığı için çözüm üretilemedi.";
    public const string Unreliable = "Yapay zekâ bu soru için güvenilir bir çözüm üretemedi.";
    public const string ProviderFailure = "Yapay zekâ şu anda yanıt veremiyor. Lütfen biraz sonra tekrar deneyin.";
    public const string PersonalLimit = "Bugünkü yapay zekâ çözüm hakkınız doldu. Yarın tekrar deneyebilirsiniz.";
    public const string GlobalLimit = "Yapay zekâ bugün için yoğun. Lütfen yarın tekrar deneyin.";
    public const string MustAnswerFirst = "Yapay zekâ çözümü istemek için önce soruyu cevaplamalısınız.";
    public const string Created = "Yapay zekâ çözümü hazır.";
    public const string Existing = "Bu sorunun yapay zekâ çözümü zaten mevcut.";
    public const string QuestionNotFound = "Soru bulunamadı.";
    public const string DisputeNotification = "Bir soruda cevap anahtarı hatalı olabilir. Yapay zekâ {0} şıkkını doğru buldu.";
    public const string OrphanReleased = "Yetim bekleyen kayıt iade edildi.";
    public const string DuplicateNote = "Aynı anda üretilen çözüm zaten vardı; mevcut çözüm döndürüldü.";
}
