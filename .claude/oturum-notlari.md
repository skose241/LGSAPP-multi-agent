# Oturum Notları

Her oturum kapanışında bu dosyaya yeni bir bölüm eklenir. Yeni oturumda önce bu dosya okunur, kaldığımız yerden devam edilir.

---

## Oturum 1 — 2026-11-10

### Yapılanlar
- `claude/` klasörünün adı `.claude/` olarak değiştirildi. Ajanlar artık `.claude/agents/` altında: `backend-agent.md`, `frontend-agent.md`, `reviewer-agent.md`.
- `backend-agent.md` tool listesine `Write` eklendi (önceden yeni dosya oluşturamıyordu).
- Ajanlar oturum açıldıktan sonra taşındığı için bu oturumda `backend-agent` yüklenemedi. Görev, aynı tanım ve aynı model (sonnet) ile `general-purpose` ajanına verildi. Yeni oturumda `backend-agent` ve `reviewer-agent` doğrudan kullanılabilir olmalı.
- Önceki bir oturumdaki backend-agent çıktısına erişim yoktu, tekrar verilemedi.

### Canlı sistem incelemesi (github.com/skose241/LGSApp, CFML/Lucee)
- Public repo; `gh` CLI makinede yok, `git clone` ile alındı (geçici klon: `%TEMP%\lgs-live-src\repo`, silinmiş olabilir; gerekirse tekrar klonla).
- Şema: `database/LGSApp.sql`. Tablolar: Kullanicilar (kullaniciAdi, adSoyad, sifreHash, rol, bransDersID, puan, avatar, sonGirisTarihi, aktifMi), Dersler, Konular, Sorular (kaynak 2/3/4, yayinTarihi, yayinlandiMi, dogruCevap A-D), Cevaplar, Cozumler, Yorumlar (ağaç yapısı YOK, ParentId yok), Begeniler, Bildirimler, Sikayetler, Odevler (taslak/planlandi/yayinda/kapandi), OdevSorulari, OdevCevaplari, GunlukKonuPlani, UretimLog, Ayarlar, Oturumlar, HataLog, AILog. Seed: `database/Ayar.sql`.
- Canlıda e-posta yok. Şifre sıfırlama kapalı, "okul yönetimine başvurun" deniyor.
- **"Yetkisiz erişim" zamanlayıcı hatasının muhtemel nedenleri:**
  - `gorevler/*.cfm`, URL `?token=` değerini `LGS_URETIM_TOKEN` ortam değişkeniyle karşılaştırıyor. Değişken Lucee servisine görünmüyorsa veya servis yeniden başlatılmadıysa boş kalıyor.
  - Token'daki özel karakterler URL'de encode edilmemiş olabilir.
  - `gorevler/web.config` sadece `127.0.0.1`'e izin veriyor; dış domainden çağrılırsa IIS 403 döner.
- **iPhone toplu yükleme hatasının muhtemel nedenleri:**
  - `web.config` istek limiti 50 MB; 20 iPhone fotoğrafı bunu aşıyor.
  - Sunucu yalnızca jpeg/png/webp kabul ediyor (strict), HEIC reddediliyor.
  - `topluYukle.js` dosyaları `DataTransfer` ile gizli input'a atıyor; eski iOS Safari'de çalışmıyor.
  - Yeni sistem için öneri: istemcide küçült, tek tek Azure Blob'a SAS ile yükle, HEIC'i sunucuda dönüştür.

### Kullanıcı kararları (kesin)
- **Hesaplarda e-posta (ve telefon) KESİNLİKLE kullanılmayacak.** Kimlik yalnızca kullanıcı adı ve şifre.
- Şifremi unuttum akışı: kullanıcı talep açar, müdür onaylar, tek seferlik şifre üretilir, ilk girişte değiştirme zorunlu.

### Backend durumu (`backend/`, .NET 10, commit edilmedi)
- Projeler: LGSApp.Api / LGSApp.Domain / LGSApp.Infrastructure. Identity (int key) + JWT + EF Core SQL Server.
- E-postasız yeniden yazıldı:
  - Email/Phone kolonları `Ignore` edildi.
  - `IAppEmailSender` ve `LoggingEmailSender` silindi.
  - Migration sıfırdan üretildi: `20261110132050_InitialIdentity`. DB'ye UYGULANMADI.
- Eklenenler:
  - `PasswordResetRequest` entity'si (bekliyor/tamamlandı/reddedildi, RowVersion, bekleyen talep için filtreli unique indeks).
  - `AdminPasswordResetRequestsController`, `OneTimePasswordService`, `DummyPasswordVerifier`.
  - `RateLimitingExtensions` ve `RateLimitingOptions` (login 10/60sn, forgot 5/300sn, IP bazlı).
  - `UserNameRules` (3–50 karakter, ASCII harf, rakam, `. _ -`).
  - `GET /api/admin/users/{id}`, `LastLoginAt`.
- Güvenlik düzeltmeleri:
  - JWT'de `security_stamp` claim'i; `OnTokenValidated` içinde DB ile karşılaştırılıyor.
  - Ban, şifre değişimi, şifre yenileme ve talep tamamlamada stamp güncelleniyor.
  - Login'de sahte hash doğrulaması yapılıyor; ban bilgisi yalnızca doğru şifreden sonra gösteriliyor.
  - Kilitli hesapta şifre hiç denenmiyor ve genel 401 dönüyor. Bu ajanın bıraktığı oracle açığıydı, elle düzeltildi.
  - Kullanıcı oluşturma ve rol atama transaction + execution strategy içinde.
  - Seeder rol sonucunu kontrol ediyor.
  - `UseForwardedHeaders` eklendi (ForwardLimit=1, KnownProxies boş, App Service için).
  - Tüm mesajlar Türkçe karakterli.
- Son durum: `dotnet build LGSApp.slnx` 0 uyarı, 0 hata. **API çalıştırılmadı, uç noktalar test edilmedi.**
- Uç noktalar:
  - auth: `login`, `change-password`, `forgot-password` (kullanıcı adıyla), `me`. `reset-password` silindi.
  - admin/users: list, `{id}`, create, `ban`, `unban`, `regenerate-password`.
  - admin/password-reset-requests: list, `{id}/complete`, `{id}/reject`.

### Açık sorular (kullanıcı onayı bekliyor)
1. Kullanıcı adında Türkçe harf kabul edilmiyor, çünkü ı/i normalizasyonu çakışma yaratıyor. Canlıdaki kullanıcı adlarında Türkçe harf varsa taşımadan önce karar verilmeli.
2. `regenerate-password` AI rolünü zorunlu şifre değişikliğine düşürmüyor; talep tamamlama ise her rolü düşürüyor. Zamanlayıcı mimarisiyle netleşecek.
3. ForwardedHeaders güven ayarı yalnızca Azure App Service arkasında güvenli.

### Sıradaki adımlar
1. **reviewer-agent** ile backend'i çalıştırıp uç noktaları test et. Gerekirse önce yerel DB: `dotnet ef database drop` ve `dotnet ef database update`. Bu komutlar kullanıcı onayıyla çalıştırılmalı, LocalDB kullanılıyor.
2. Plan agent ile domain tasarımı (canlı şema temel alınarak): Ders/Konu, Soru, Cevap, Çözüm (zorunlu açıklama), Yorum (ağaç için ParentId), Beğeni, Şikayet, Ödev (planlı/gün kısıtlı), Günlük Konu Planı, Üretim Log'u, Ayarlar, Bildirim, liderlik tablosu.
3. Zamanlayıcı: Azure Functions Timer Trigger (17:30 üretim, 18:15 tamamlama, 19:00 yayın ve ödev kapatma). Kullanıcı JWT'si yerine Managed Identity veya API anahtarı kullanılmalı. Müdürün manuel tetiklemesi aynı servisi çağırmalı.
4. AI: Semantic Kernel + Gemini (canlıda iki ayrı anahtar var: `GEMINI_API_KEY_Soru` ve `GEMINI_API_KEY_Cozum`).
5. Daha sonra: refresh token (mobil için), test projesi, Key Vault, MSSQL'den veri taşıma.
