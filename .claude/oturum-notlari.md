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

---

## Oturum 2 — 2026-11-10 — reviewer-agent backend test raporu (tam metin)

## Backend uçtan uca test raporu

Ortam: API http://localhost:5299, Development. Test DB `LGSApp_ReviewTest`, `ConnectionStrings__DefaultConnection` ortam değişkeniyle verildi. Mevcut `LGSApp` DB'sine dokunulmadı. Test sonunda API kapatıldı ve yalnızca `LGSApp_ReviewTest` silindi (sys.databases'te yok). Kod değiştirilmedi, git status temiz.

Seed bilgisi: appsettings'te `Seed:AdminUserName` ve `Seed:AdminPassword` boş. Seeder (`C:\Proje\LGSApp-v2\backend\src\LGSApp.Infrastructure\Persistence\DbSeeder.cs`) yalnızca `Seed__AdminUserName` ve `Seed__AdminPassword` ortam değişkenleriyle müdür oluşturuyor. Ben `mudur.test` / `M******` verdim. `appsettings.Development.json` içinde `Seed:Enabled=true`.

### Madde sonuçları

1. **GEÇTİ.** `dotnet build`: 0 uyarı, 0 hata. `dotnet ef database update` ile `20261110132050_InitialIdentity` temiz uygulandı. Kısmi benzersiz indeks `UX_PasswordResetRequests_UserId_Pending` oluştu.

2. **GEÇTİ (mesaj dili kısmı hariç, madde 9'a bak).**
   - Yanlış şifre ve olmayan kullanıcı: ikisi de aynı 401 ve aynı başlık, ayırt edilemiyor.
   - `me` 200. `change-password`: aynı şifre 400, zayıf şifre 400, yanlış mevcut şifre 400, başarılı 200 ve yeni token döner.
   - `forgot-password`: var olan ve olmayan kullanıcıda gövde aynı (`{"message":"Talebiniz okul yönetimine iletildi."}`), engelli kullanıcıda da aynı. Yalnızca `UserName` boş gönderilirse 400 döner (bkz. madde 9).

3. **GEÇTİ.** İkinci bir müdür hesabı (`mudur2`) tek seferlik şifreyle girdi (`mustChangePassword=true`).
   - `GET /api/admin/users`, `GET /api/admin/password-reset-requests` ve `POST /api/admin/users` 403 döndü. `/api/auth/me` 200 döndü.
   - `change-password` sonrası aynı uçlar 200 oldu ve eski JWT 401 oldu.

4. **GEÇTİ.**
   - `list` (role filtresi dahil), `{id}` ve 404 çalışıyor.
   - `create` 201, tek seferlik şifre 14 karakter. Tekrar eden kullanıcı adı 409. Geçersiz rol 400.
   - Reddedilen kullanıcı adları (hepsi 400): `ab`, 51 karakter, `ışık.ogr`, `öğrenci1`, `ab cd`, `a@b.c`, `ali/veli`, `ğüş`. `Ogr.One-1_x` kabul edildi.
   - `ban` 204, `unban` 204. Kendini banlama 400, olmayan id 404.
   - `regenerate-password` 200. AI rolünde `mustChangePassword=false`.
   - Öğretmen ve öğrenci token'ı ile list, create, ban ve password-reset-requests: 403. Anonim: 401.

5. **GEÇTİ.** Eski JWT dört durumda 401 döndü: ban, change-password, regenerate-password ve talep tamamlama. Unban sonrası eski JWT de 401 (stamp değişiyor, beklenen).

6. **GEÇTİ.**
   - `forgot-password` ardından `list` ile talep göründü. Aynı kullanıcı için tekrar çağrıda bekleyen talep sayısı 1 kaldı.
   - `complete` 200, tek seferlik şifre döndü, kullanıcı `mustChangePassword=true` oldu ve yeni şifreyle giriş yapıldı. Tekrar `complete` ve işlenmiş talebe `reject` 409. Olmayan id 404.
   - `reject` 204. Sonrasında yeni talep açılabiliyor.

7. **GEÇTİ.** 5 hatalı denemeden sonra kilitli hesapta doğru şifre 401 döndü. Başlık ve durum kodu olmayan kullanıcıyla aynı. Ban bilgisi (403 "Hesap engellenmiş.") yalnızca doğru şifreyle görünüyor. Banlı kullanıcıda yanlış şifre 401 dönüyor.

8. **GEÇTİ (bypass hatası var, aşağıda).** Login: 10 istekten sonra 429. `forgot-password`: 5 istekten sonra 429, `Retry-After: 300`, Türkçe gövde.

9. **KALDI (kısmen).** Bizim kodun mesajları Türkçe ve karakterleri doğru (ş, ı, ğ, ö, ü görüntüleniyor). İki yerde İngilizce mesaj sızıyor:
   - Identity hata açıklamaları: `Passwords must be at least 8 characters. Passwords must have at least one digit ('0'-'9'). Passwords must have at least one uppercase ('A'-'Z').` ve `Incorrect password.`. Bunlar `detail` alanına `string.Join` ile basılıyor.
     - `C:\Proje\LGSApp-v2\backend\src\LGSApp.Api\Controllers\AuthController.cs:195` (`IdentityProblem`)
     - `AdminUsersController.cs:196`
     - `AdminPasswordResetRequestsController.cs:~85`
     - Çözüm: Türkçe bir `IdentityErrorDescriber` kaydı (`DependencyInjection.cs`).
   - DataAnnotations doğrulama hataları İngilizce: `{"title":"One or more validation errors occurred.","errors":{"UserName":["The UserName field is required."]}}`. Kaynak `Dtos\AuthDtos.cs` ve `Dtos\AdminDtos.cs`. Ayrıca 401/403/404 gövdelerinin başlıkları İngilizce ("Unauthorized", "Forbidden", "Not Found"), `Program.cs` içindeki `UseStatusCodePages` ve `AddProblemDetails` varsayılanları.

### Bulunan hatalar (önem sırasına göre)

1. **Orta, güvenlik:** `ForwardedHeaders` için `KnownIPNetworks` ve `KnownProxies` temizlenmiş (`C:\Proje\LGSApp-v2\backend\src\LGSApp.Api\Program.cs:9-14`), yani her istemci `X-Forwarded-For` ile IP'sini değiştirebiliyor. Kanıtı: login limiti aşılmışken (429) `curl -X POST /api/auth/login -H 'X-Forwarded-For: 9.9.9.9'` isteği 401 döndü, yani limit atlandı. Bu, IP başına login/forgot rate limit'ini ve dolayısıyla kaba kuvvet korumasını etkisiz kılıyor. Hesap bazlı kilitlenme (5 deneme, 10 dk) yine devrede, ama `forgot-password` spam'i ve kullanıcı adı taraması sınırsız. Azure App Service/ön proxy arkasında yalnızca güvenilen proxy'ler tanımlanmalı.
2. **Düşük, kullanılabilirlik:** Identity ve DataAnnotations hata mesajları İngilizce (madde 9).
3. **Düşük, tasarım notu:** Kilitlenme mesajı her 401'de "hesap 10 dakika kilitlenir" ifadesini içeriyor. Bu bir sızıntı değil (hepsinde aynı), ama kullanıcıya hatalı şifrede gereksiz uyarı gösteriyor.

### Test edilemeyen maddeler

- Ban ve kilit hâlinin birleşimindeki zamanlama farkları (timing side channel) ölçülmedi, yalnızca yanıt gövdesi ve durum kodu karşılaştırıldı.
- 10 dk kilit süresinin dolması test edilmedi (süre nedeniyle).
- İki yöneticinin aynı talebi eşzamanlı işlemesi (409 yarış durumu) ve eşzamanlı `forgot-password` çağrılarında benzersiz indeks yolu eşzamanlı olarak test edilmedi.
- HTTPS yönlendirmesi ve JWT süre dolumu (60 dk) test edilmedi.

Test betikleri (Python, kullan-at): `C:\Users\koses\AppData\Local\Temp\claude\9b09e5609a781acd\1b5a6de1-8a4b-429b-ad38-9f2a679a7114\scratchpad\t.py`, `t2.py`, `t3.py`.

### Oturum 2 özeti

#### Yapılanlar
- reviewer-agent ile backend uçtan uca test edildi (tam rapor yukarıda).
- Test ayrı bir veritabanında (`LGSApp_ReviewTest`) yapıldı, sonunda silindi. Mevcut `LGSApp` LocalDB'ye dokunulmadı, `database drop` çalıştırılmadı.
- Kod değiştirilmedi, commit yapılmadı. Backend hâlâ commit edilmemiş durumda.
- Sonuç: 9 maddeden 8'i geçti. Madde 9 (mesaj dili) kısmen kaldı.

#### Alınan kararlar
- Testler mevcut DB'yi silmeden, ortam değişkeniyle verilen ayrı bir test DB'sinde yapılacak (`ConnectionStrings__DefaultConnection`).
- Seed müdür hesabı yalnızca `Seed__AdminUserName` / `Seed__AdminPassword` ortam değişkenleriyle oluşturuluyor. appsettings'e şifre yazılmayacak.

#### Açık sorular
1. ForwardedHeaders: Azure'da hangi proxy/IP aralıklarına güvenilecek? Şu an `X-Forwarded-For` ile IP bazlı rate limit atlatılabiliyor. Geliştirme ortamında bu middleware kapatılsın mı?
2. Önceki oturumdan kalanlar hâlâ açık: kullanıcı adında Türkçe harf, AI rolünün regenerate-password davranışı.

#### Sıradaki adımlar
1. backend-agent ile düzeltmeler:
   - ForwardedHeaders güvenilen proxy ayarı (orta, güvenlik).
   - Türkçe `IdentityErrorDescriber`, DataAnnotations mesajları ve ProblemDetails başlıklarının Türkçeleştirilmesi.
   - Her 401'deki "hesap 10 dakika kilitlenir" uyarısının sadeleştirilmesi.
2. Düzeltmelerden sonra reviewer-agent ile tekrar test (özellikle X-Forwarded-For bypass ve mesaj dili).
3. Backend'in commit edilmesi (kullanıcı onayıyla).
4. Ardından Oturum 1'deki sıradaki adımlar: Plan agent ile domain tasarımı, zamanlayıcı (Azure Functions), Semantic Kernel + Gemini.

---

## Oturum 3 — 2026-11-11

### Yapılanlar
- backend-agent ile Oturum 2'deki düzeltmeler yapıldı. Kullanıcı commit'ledi.
  - **ForwardedHeaders:**
    - Development'ta middleware hiç eklenmiyor.
    - Development dışında `ForwardedHeaders` bölümünden okunuyor: `Enabled` (varsayılan false), `KnownProxies`, `KnownNetworks` (CIDR), `ForwardLimit` (varsayılan 1).
    - `Enabled=true` iken liste boşsa, IP/CIDR geçersizse veya `ForwardLimit<1` ise uygulama Türkçe hatayla başlamıyor.
    - Dosyalar: `Options/ForwardedHeadersSettings.cs`, `Extensions/ForwardedHeadersExtensions.cs`.
  - **Türkçe mesajlar:**
    - `TurkishIdentityErrorDescriber` (Infrastructure/Services).
    - DTO attribute mesajları.
    - `LocalizationExtensions.cs`: ProblemDetails başlıkları, ModelBinding mesajları, `InvalidModelStateResponseFactory` + `Sanitize`.
    - Bozuk/yanlış tipli JSON'da İngilizce System.Text.Json metni ve tip adı sızmıyor. Yerine "'alan' alanının değeri geçersiz." veya "İstek gövdesi geçerli bir JSON değil." dönüyor.
  - **Login 401:** Mesaj tek: "Kullanıcı adı veya şifre hatalı." "10 dakika kilitlenir" ifadesi kaldırıldı.
  - **429 yanıtı:** Gövdeye `type` eklendi (`RateLimitingExtensions.cs`).
- reviewer-agent ile tekrar test (ayrı DB `LGSApp_ReviewTest2`, sonra silindi):
  - XFF bypass kapandı.
  - Production ForwardedHeaders senaryoları geçti.
  - 401 yanıtları birebir aynı.
  - Regresyon temiz.
  - Tek kusur JSON hata sızıntısıydı, sonradan düzeltildi. 3 istekle elle doğrulandı.
- Build 0 uyarı 0 hata.

### Alınan kararlar
- Geliştirme ortamında ForwardedHeaders kapalı.
- Buluta taşınırken `ForwardedHeaders:Enabled=true` yapılacak ve `KnownProxies`'e o an yayındaki proxy IP'si (veya `KnownNetworks`'e CIDR) yazılacak.

### Açık sorular / notlar
1. Kullanıcı adında Türkçe harf (Oturum 1'den, hâlâ açık).
2. AI rolünün regenerate-password davranışı (zamanlayıcı mimarisiyle netleşecek).
3. Bozuk JSON'da `errors` anahtarı boş string (`""`). Frontend bunu genel form hatası olarak göstermeli.
4. Test edilmedi:
   - 429 `type` alanı canlı denenmedi.
   - Gerçek Azure proxy arkasında X-Forwarded-Proto/HTTPS yönlendirmesi denenmedi.
   - Mevcut `LGSApp` LocalDB'si `sys.databases`'te görünmüyordu; gerektiğinde `dotnet ef database update` ile oluşturulmalı.

### Sıradaki adımlar
1. Plan agent ile domain tasarımı (canlı şema temel alınarak):
   - Ders/Konu, Soru, Cevap
   - Çözüm (zorunlu açıklama)
   - Yorum (ağaç için ParentId)
   - Beğeni, Şikayet
   - Ödev (planlı/gün kısıtlı)
   - Günlük Konu Planı, Üretim Log'u, Ayarlar, Bildirim
   - Liderlik tablosu (haftalık/aylık)
2. Zamanlayıcı:
   - Azure Functions Timer Trigger: 17:30 üretim, 18:15 tamamlama, 19:00 yayın + ödev kapatma.
   - Kimlik doğrulama Managed Identity veya API anahtarı ile.
   - Müdürün manuel tetiklemesi aynı servisi çağırmalı.
3. AI: Semantic Kernel + Gemini (`GEMINI_API_KEY_Soru`, `GEMINI_API_KEY_Cozum`).
4. Daha sonra:
   - Refresh token (mobil)
   - Test projesi
   - Key Vault
   - MSSQL'den veri taşıma
   - iPhone toplu yükleme (istemcide küçültme, SAS ile Blob, HEIC dönüştürme)
