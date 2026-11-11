namespace LGSApp.Domain.Constants;

public static class SettingKeys
{
    public const string GunlukSoruSayisi = "gunlukSoruSayisi";
    public const string PuanDogruCevap = "puanDogruCevap";
    public const string PuanSoruYukleme = "puanSoruYukleme";
    public const string PuanCozumYazma = "puanCozumYazma";
    public const string CozumEsikCevapSayisi = "cozumEsikCevapSayisi";
    public const string CozumEsikYanlisOrani = "cozumEsikYanlisOrani";
    public const string AciklamaMinKarakter = "aciklamaMinKarakter";
    public const string SoruUretimAktifMi = "soruUretimAktifMi";
    public const string SoruCarpani = "soruCarpani";
    public const string AiGunlukCozumLimit = "aiGunlukCozumLimit";
    public const string YorumMaxKarakter = "yorumMaxKarakter";
    public const string YorumMaxDerinlik = "yorumMaxDerinlik";
    public const string YorumGorunurDerinlik = "yorumGorunurDerinlik";
    public const string YorumDuzenlemeDk = "yorumDuzenlemeDk";
    public const string YorumSoruBasinaMax = "yorumSoruBasinaMax";
    public const string CozumMaxKarakter = "cozumMaxKarakter";
    public const string SikayetMinKarakter = "sikayetMinKarakter";

    public static readonly IReadOnlyList<(string Key, int Value, string Description)> Defaults =
    [
        (GunlukSoruSayisi, 1, "Her ders için günlük üretilecek soru sayısı."),
        (PuanDogruCevap, 5, "Doğru cevap puanı."),
        (PuanSoruYukleme, 3, "Soru yükleme puanı."),
        (PuanCozumYazma, 5, "Çözüm yazma puanı."),
        (CozumEsikCevapSayisi, 5, "Yapay zeka çözümü için asgari cevap sayısı eşiği."),
        (CozumEsikYanlisOrani, 60, "Yapay zeka çözümü için yanlış cevap oranı eşiği (yüzde)."),
        (AciklamaMinKarakter, 30, "Öğrenci çözüm açıklamasının asgari karakter sayısı."),
        (SoruUretimAktifMi, 1, "Günlük soru üretimi açık mı (1 açık, 0 kapalı)."),
        (SoruCarpani, 1, "Günlük soru sayısı çarpanı."),
        (AiGunlukCozumLimit, 5, "Öğrenci başına günlük yapay zeka çözüm hakkı."),
        (YorumMaxKarakter, 800, "Yorumun azami karakter sayısı."),
        (YorumMaxDerinlik, 10, "Yorum ağacının mutlak azami derinliği (en fazla 10)."),
        (YorumGorunurDerinlik, 3, "Listede bir kökün altında gösterilen yorum seviyesi sayısı."),
        (YorumDuzenlemeDk, 15, "Yorum düzenleme süresi (dakika)."),
        (YorumSoruBasinaMax, 1000, "Bir soruya yazılabilecek azami yorum sayısı."),
        (CozumMaxKarakter, 4000, "İnsan tarafından yazılan çözümün azami karakter sayısı."),
        (SikayetMinKarakter, 10, "Şikayet açıklamasının asgari karakter sayısı.")
    ];
}
