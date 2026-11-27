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

---

## Oturum 4 — 2026-11-11 / 2026-11-12

### Yapılanlar
- Canlı repo scratchpad'e klonlandı (geçici). Plan agent ile domain tasarımı çıkarıldı. Tasarım `.claude/tasarim-domain.md` dosyasında: temel tasarım + "Revizyon 1" + "Revizyon 2" bölümleri. Çelişkide en son revizyon geçerli.
- Canlıda şema kayması tespit edildi: kod `Yorumlar.cozumID`, `Sorular.cevapSupheli`, `DersProgrami` tablosu, `soruCarpani` ayarı ve ödev `planlandi` durumunu kullanıyor ama `LGSApp.sql`'de yoklar. Ayrıca yorumun bağlandığı çözümün aynı soruya ait olduğu doğrulanmıyor (canlı bug).
- backend-agent:
  - 19 entity + 19 enum, `Persistence/Configurations/*`.
  - Migration'lar: `20261111180242_DomainModel` ve `20261111202916_Revision1`. 2411ce4'teki `20261111191144_Revision1` silinip aynı kapsamla yeniden üretildi. Hiçbir kalıcı DB'ye uygulanmadı.
  - Servisler: QuestionAccess, Lesson, Question, Answer, Solution, Comment + CommentTreeBuilder, Point (ledger), Notification, Report, Settings, TurkeyTime, AppUserManager.
  - Uçlar: lessons, questions/{id}, answers, solutions (öğretmen çözümü + PATCH), yorumların tamamı (liste, oluşturma, PATCH, DELETE, remove, restore, reports, `GET /api/comments/{id}/thread`).
- reviewer-agent 3 tur test etti (ReviewTest3/4/5). Son turda kritik, yüksek veya orta bulgu kalmadı. Build 0 uyarı, 0 hata.

### Alınan kararlar
- **Yorum ağacı:** ParentId + RootId + Depth (adjacency list). Composite FK'ler `(ParentId|RootId|SolutionId, QuestionId)`.
  - Gerçek derinlik saklanır, mutlak sınır 10. Yalnız bu sınırda kardeşe bağlanır ve `ReplyToUserId` dolar.
  - Liste `yorumGorunurDerinlik=3` seviye döner. Daha derin dallar "Devamını göster" (`hasMoreReplies`, `hiddenReplyCount`) ile `/thread` ucundan açılır. Yanıt başına en fazla 500 düğüm.
  - Silme soft. Görünür torunu olan silinmiş düğüm "[silindi]" yer tutucusu olur, olmayan budanır.
  - Düzenleme yazara açık, 15 dk içinde.
- **Görünürlük:** Yalnız soruyu cevaplayan, soru sahibi, öğretmen/müdür veya kapalı ödev. Soru detayı, çözümler ve yorumlar aynı `CanSeeDiscussion` fonksiyonunu kullanır.
- **Ödev sorusu:** Ödevdeki soru havuzdan görünmez, görünürlüğü yalnız ödev durumuna bağlıdır.
- **Cevaplar:** Havuz ve ödev cevapları tek `Answers` tablosunda. Bir soru en fazla bir ödevde olabilir.
- **Puan:** `PointTransactions` ledger'ı tutulur, `Users.Points` onun önbelleğidir. Cevap anahtarı düzeltmesinde puan eksiye düşebilir.
- **AI sistem hesabı (`yapay.zeka`):**
  - Şifresi yok, giriş imkânsız, kilitlenmez, banlanamaz.
  - Her açılışta (`Seed:Enabled`'dan bağımsız) garanti edilir ve onarılır.
  - Bütünlük bozuksa uygulama açılmaz: başka rolde olması, ikinci AI hesabı, AI hesabında ek rol.
  - Token rolü her istekte DB'den doğrulanır. Rezerve adlar: yapayzeka, ai, sistem, system (`.`, `_`, `-` yok sayılarak).
- **IP kısıtı:** Ek katman olarak yalnız zamanlayıcının tetikleme ucunda kullanılacak. Asıl koruma kodda (DB rol kontrolü).
- **UTC:** Tüm DateTime alanları UTC converter'dan geçer, JSON her zaman `Z` ile döner. Türkiye günü yalnız `TurkeyTime` ile hesaplanır. Functions cron UTC'dir: 17:30 TR = 14:30 UTC.
- **Türkçe metin:** NFC ile saklanır, bidi ve görünmez karakterler temizlenir. Tekrar algılama `BodyFingerprint` ile yapılır (NFKC, tr-TR küçük harf, ı/İ/i̇ → i). Açılışta globalization öz-testi var; ICU yoksa uygulama açılmaz (`InvariantGlobalization` kapalı kalmalı).
- **Varsayılan kabul edilenler (değiştirilebilir):**
  - tam ban, yorum susturma yok
  - öğrenciler kullanıcı adı görür, ad soyad yalnız öğretmen/müdür
  - ödevler tüm öğrencilere gider
  - yorum oylaması yok
  - `uretimSikligi` taşınmaz
- **JSON:** Enum'lar camelCase string, `rowVersion` base64. Bu frontend sözleşmesi.

### Açık bulgular (düşük, Revizyon 2 test raporu)
1. Login'de var olan kullanıcı + yanlış şifre ~3.4 ms, forgot-password'da ~1 ms yavaş. Gerekirse her başarısız yanıta sabit gecikme.
2. İki örnek aynı anda boş DB'ye açılırsa müdür ve ders seed'lerinde `fail` seviyesinde log gürültüsü oluşuyor (`Program.cs` RunSeedStepAsync, `DbSeeder`).
3. `CommentRules.cs` satır 41/145/148/149'da ham U+0307/U+0327 var. `\u` kaçışıyla yazılmalı.
4. Boşluk-yalnız yorumda "Yorum metni zorunludur.", görünmez karakterli yorumda "Yorum boş olamaz." dönüyor. Tek mesaja indirilmeli.
5. Alt bölge bayrak emojileri (İskoçya/Galler) tag temizliği yüzünden siyah bayrağa dönüşüyor.
6. Fingerprint NFKC yanlış pozitifleri (x²≡x2, H₂O≡H2O). Yalnız aynı kullanıcı, aynı soru, 60 sn içinde etkili.
7. `Comments.CreatedAt` DEFAULT kısıtı isimsiz (EF'in DomainModel'den kalan adı).

### Açık sorular
1. Kullanıcı adında Türkçe harf (Oturum 1'den, hâlâ açık).
2. Başka bir makinede/DB'de eski `20261111191144_Revision1` uygulandıysa `__EFMigrationsHistory` düzeltilmeli. LocalDB'de `LGSApp` DB'si yok.
3. Zamanlayıcının kimlik doğrulaması: API anahtarı mı, Managed Identity mi (+ App Service Access Restrictions)?

### Sıradaki adımlar
1. İstenirse açık düşük bulgular 2, 3 ve 4'ün kapatılması.
2. Sonraki modüller (backend-agent, tasarım belgesine göre):
   - şikayet yönetimi + cevap anahtarı düzeltme (ledger AnswerKeyCorrection, UPDLOCK)
   - soru yükleme + beğeni
   - ödev (AssignmentService: havuzda cevaplanmış soru ödeve eklenemez)
   - liderlik tablosu (haftalık Pazartesi 00:00 TR ve aylık ledger üzerinden)
   - bildirim listesi
3. Zamanlayıcı:
   - `SchedulerService` + `GenerationRun` kilidi
   - Azure Functions Timer (UTC cron)
   - müdürün manuel tetiklemesi aynı servisi çağıracak
   - AI hesabı sunucu içinden `AuthorUserId` olarak kullanılacak
4. AI: Semantic Kernel + Gemini (`GEMINI_API_KEY_Soru`, `GEMINI_API_KEY_Cozum`), `AiLog` ile günlük limit.
5. Dosya: StoredFile + Azure Blob SAS (Azurite), iPhone toplu yükleme (istemcide küçültme, HEIC dönüştürme).
6. Frontend'e başlarken sözleşme notları: enum camelCase, `Z`'li UTC, `rowVersion` base64, bozuk JSON'da `errors` anahtarı `""`, yorum DTO'ları ve `hasMoreReplies`.
7. Daha sonra: refresh token, test projesi (CommentTreeBuilder saf, ilk aday), Key Vault, MSSQL'den veri taşıma (ders/konu IDENTITY_INSERT, `DersProgrami.gunNo` Pazar=1 → ISO dönüşümü).

## Oturum 5 — 2026-11-12 / 2026-11-13

### Yapılanlar (commit sırasıyla)
- `9718cfb` Kullanıcı adında Türkçe harf (`TurkishLookupNormalizer`: ı/İ/I/i→I, ç→C, ğ→G, ö→O, ş→S, ü→U; "şükrü" = "sukru"); Oturum 4'ün 7 düşük bulgusu kapatıldı (sabit yanıt süreleri, seed `sp_getapplock`, CommentRules `\u` kaçışları, tek boş-yorum mesajı, isimli DEFAULT kısıtı vb.).
- `4f2aa03` Şikayet yönetimi + cevap anahtarı düzeltme (UPDLOCK, set-based IsCorrect, ledger farkı), beğeni, bildirim listesi, liderlik tablosu (haftalık/aylık, önbellek). `0c11562` 3 düşük bulgu.
- `b7271aa` Ödev modülü (taslak/planlı/açık/kapalı, `AssignmentState` zamanlayıcıdan bağımsız; en fazla 200 soru; silinince ödev için yaratılan sorular gizlenir, havuzdan eklenenler döner; ödev açıkken tartışma ve beğeni sayısı gizli, doğru şık cevaplayınca görünür). Müdür kuralları: müdür müdürü banlayamaz/şifresini yenileyemez/talebini onaylayamaz; müdür şifresi ≥12, JWT 30 dk; 10 tek kullanımlık kurtarma kodu (HMAC-SHA256 + `RecoveryCodes:Pepper`, `XXXX-XXXX-XXXX`), `POST /api/auth/recover`, sunucu komutu `dotnet LGSApp.Api.dll reset-mudur-password <kullaniciAdi>`; seed müdür ilk girişte şifre değiştirir ve kodlarını alır (`recoveryCodesMissing`).
- reviewer-agent test turu (ReviewTest10): 6 maddeden 5'i geçti; orta bulgu: yanlış kurtarma kodu müdürü kilitliyordu.
- `eb81b36` Kurtarma kilitleme açığı kapatıldı (yanlış kod kilitlemez, doğru kod kilidi açar); ödev tarihleri en fazla +1 yıl; serbest metinlerde kontrol karakteri reddi (`NoControlCharsAttribute`).
- `b5a2832` Dosya altyapısı + soru yükleme: `POST/GET/DELETE /api/files` (API üzerinden multipart, 10 MB, `clientUploadId` idempotent), Azure Blob private container + blob başına 90 dk read SAS (30 dk kovalara hizalı), SkiaSharp 4.156.0 ile magic bytes/boyut/animasyon kontrolü, EXIF yönü (8 durum), küçültme (≤2000), EXIF/GPS/ICC temizliği, JPEG q82; HEIC özel mesajla red (istemci çevirecek). `POST /api/questions` (öğrenci: fotoğraf + açıklama, anında yayın, günde 20, ilk 5 puanlı; öğretmen/müdür: anında veya `scheduledPublishDate`), `GET /api/questions/mine`, `IStoredFileValidator`, görünümlere `image{url,...}`, `FileCleanupService`, `POST /api/admin/files/cleanup`. ImageSharp 3.1.12'nin 6 açığı + yeni sürümlerin lisans anahtarı zorunluluğu nedeniyle SkiaSharp'a geçildi.
- (bu commit) Zamanlayıcı: `SchedulerWorker` (BackgroundService, uyku planlayıcısı, polling yok), `GenerationRunStore` (sp_getapplock claim + LeaseUntil/heartbeat, `Interrupted`), Generate/Complete (aynı eksik-slot algoritması), Publish (AI + tarihi gelmiş öğretmen soruları, ödeve bağlılar hariç, RunId'li bildirim), Assignments (00:05 kapat+aç, bildirimler artık gidiyor), `IQuestionGenerator` (NotConfigured varsayılan, Development'a özel Fake), `api/admin/scheduler` (status, runs, runs/{id}, POST runs, 5/dk), `api/topic-plans`, `api/admin/generation-schedule`, `DevTime:OffsetMinutes` (yalnız Development), ilk test projesi `backend/tests/LGSApp.Tests` (49 birim test). Canlı duman testi geçti.

### Alınan kararlar
- Barındırma: 100$ öğrenci kredisi, App Service Linux B1 Always On, 5–6 ay; Azure SQL ücretsiz teklif/Basic; zamanlayıcı API içinde (Azure Functions yok).
- Müdür: yeni müdür butonu kalır; kritik işlemde yeniden şifre sorulmaz; hesap kurtarma = kurtarma kodu + sunucu komutu.
- PDF'ten ödev sorusu: önce pdf.js metin katmanı, eksik/hatalıysa Gemini, her durumda öğretmen onayı (AI modülünden sonra).
- Yükleme API üzerinden (SAS upload yok); okuma read SAS. Öğrenci sorusu anında yayın; öğretmen havuza doğrudan soru ekleyebilir.
- Görsel kütüphanesi SkiaSharp (MIT); Gemini görsel işleme için kullanılmaz (içeriği yeniden çizer, SynthID, maliyet, gizlilik).
- Zamanlayıcı saatleri appsettings'te sabit; telafi yalnız aynı gün (Generate 23:00'a kadar), geç üretim ikinci yayınla; konu planı/ders programı canlı kurallarla (branş, 16:45, kullanılmış plan kilidi, 30 gün, hedefi yalnız müdür).
- Ayrıntılar: `.claude/tasarim-domain.md` Revizyon 3, 4, 5.

### Canlıya taşırken gerekenler
- App Service ayarları: `ConnectionStrings__DefaultConnection`, `Jwt__*`, `RecoveryCodes__Pepper` (≥32 bayt, bir kez belirlenip sabit kalmalı; değişirse tüm kurtarma kodları geçersiz), `Storage__ConnectionString`, `Seed__AdminUserName`/`Seed__AdminPassword` (ilk açılış). Bunlar yoksa uygulama açılmaz.
- Storage hesabı: StorageV2 LRS Hot, aynı bölge, anonim erişim kapalı, TLS 1.2, `images` private container, soft delete 7 gün.
- Linux publish'te `libSkiaSharp.so` var; gerçek Linux'ta çalıştırma deploy'da doğrulanmalı.
- Bütçe uyarısı (50$/80$).

### Açık kalanlar / bilinenler
- Zamanlayıcı: graceful shutdown'da `Interrupted` yazılması denenmedi (lease devralma test edildi). Entegrasyon senaryoları otomatik testte değil, elle duman testinde.
- Zamanlayıcı modülü reviewer-agent ile bağımsız test edilmedi (kullanıcı doğrudan commit istedi).
- Düşük gözlemler: açık ödevde cevaplamayan öğrenci beğenebiliyor; cevaplayan öğrenci beğeni sayısını kapanmadan görüyor; eski veriden kalma müdür reset talebi admin listesinde görünmüyor.
- Müdür hesabı normal girişte 5 yanlış şifreyle 10 dk kilitlenebilir (kurtarma kodu artık kilidi açıyor).
- Liderlik önbelleği örnek başına; ayar değişiklikleri SettingsService önbelleğinde 5 dk.
- Veri taşıma: ders programı günleri ISO (Pzt=1), canlı Pazar=1 → dönüşüm; `Question.Description` 4000 (canlıdaki en uzun değer kontrol edilmeli); StoredFiles CK (Ready ise Width/Height dolu).
- `ef` araçları 10.0.12 / runtime 10.0.14 uyarısı (işlevsel değil).

### Sıradaki adımlar
1. İstenirse zamanlayıcı için reviewer-agent test turu.
2. AI modülü: Semantic Kernel + Gemini (`GEMINI_API_KEY_Soru`, `GEMINI_API_KEY_Cozum`), `IQuestionGenerator` Gemini uygulaması (tek soruluk JSON, son 5 soru benzemesin, 4 şık, açıklama ≥50, 429/503 yeniden deneme), öğrenci istekli çözüm, `AiLog` + günlük limit, AI şüpheli cevap anahtarı (`AiSuggestedOption`).
3. PDF'ten ödev sorusu (`POST /api/ai/detect-questions`).
4. Havuz soru listesi `GET /api/questions`; çözüm silme ucu (bağlı yorumlar); öğretmenin öğrenci profili istatistikleri; ayar düzenleme ucu (`soruUretimAktifMi`, `soruCarpani`).
5. Frontend (Next.js) — sözleşme notları: enum camelCase, `Z`'li UTC, `rowVersion` base64, `image.url` (Next.js `unoptimized`), yükleme istemcide küçültme + HEIC çevirme, `DataTransfer` yok, 2–3 eşzamanlı yükleme, aynı `clientUploadId` ile 1/3/9 sn yeniden deneme, müdür `recoveryCodesMissing` yönlendirmesi.
6. Key Vault, Managed Identity, MSSQL'den veri taşıma, Azure'a deploy.

## Oturum 6 — 2026-11-14 / 2026-11-16

### Yapılanlar (commit sırasıyla)
- `33cd61a` Öğretmen branş ataması (`branchLessonId`, `PUT /api/admin/users/{id}/branch-lesson`) ve zamanlayıcıda sınırlı yeniden deneme (günde en fazla 3, 10 dk ara, 23:00 sınırı).
- AI modülü (plan: `.claude/plan-ai-modulu.md`, tasarım: `tasarim-domain.md` Revizyon 7):
  - `ef1fbd1` altyapı ve veri modeli: `IGeminiClient`/`GeminiRestClient` doğrudan REST, yeniden deneme, AiLog, maliyet.
  - `ce93586` öğrenci istekli çözüm: kota (öğrenci 5/gün, global 150), Blind/Verified mod, `aiSolutionState`.
  - `c78f6c6` Gemini ile soru üretimi ve doğrulama, `AiProviderGate` devre kesici.
  - `616dd15` şüpheli cevap anahtarı: AI çözümü gizlenir, `GET /api/admin/disputed-questions`, dismiss, branş yetkisi, inceleme notu, run düzeyi hata bildirimi.
  - `272441c` yönetim: `GET /api/admin/ai/usage`, `GET /api/admin/ai/status`, `GET/PUT /api/admin/settings` (beyaz liste); uyuşmazlık sonrası bekleme süresi.
  - `db8769f` tasarım belgesine Revizyon 7 eklendi.
- Frontend (plan: `.claude/plan-frontend.md`):
  - `a1b791c` F0, backend hazırlığı:
    - `contracts/openapi.json` build'de üretiliyor.
    - BFF istemci IP'si (`Bff:ProxyKey`, `X-LGS-Client-IP`).
    - Dönen refresh token: öğrenci/öğretmen 30 gün kayan + 90 gün mutlak, müdür 12 saat; reuse tespiti, 30 sn tolerans ve en fazla 3 kardeş; must_change oturumlarında refresh yok.
  - `9b696bd` F1a: pnpm monorepo (`frontend/apps/web`, `frontend/packages/api`), Next 16, Tailwind v4, yeni tasarım sistemi (gece mavisi #3548c4 + mercan #f98640, Bricolage Grotesque + Figtree), `/tasarim` vitrini, geniş masaüstü düzeni, `dev:lan`.
  - `22ea5ed` F1b: BFF (httpOnly `__Host-` çerezler, otomatik yenileme, CSRF, `TRUST_PROXY`), `proxy.ts`, auth ekranları, rol menülü kabuk. Reviewer bulguları (open redirect vb.) kapatıldı. `logout-all` artık security stamp'i yeniliyor.
  - `2b947e0` F2: müdür kullanıcı yönetimi (liste + 25'lik sayfalama, oluşturma, tek seferlik şifre + yazdırılabilir giriş kartı, ban, şifre yenileme, branş) ve şifre talepleri.
  - `dc46300` F3 backend:
    - `GET /api/questions` havuz listesi, `GET /api/me/stats`, `GET /api/settings/public`.
    - Öğrenci çözümünü düzenleme (`PATCH /api/solutions/{id}`, silme yok); bekleyen şikayet varken kilitli (409, `editLockedReason`).
    - 480 px thumbnail (`ImageView.thumbnailUrl`, migration `StoredFileThumbnails`).
- Testler: backend 682, frontend vitest ~114, E2E Chromium + WebKit iPhone. Her aşamada reviewer turu yapıldı.

### Alınan kararlar
- AI: doğrudan REST (SK yok), uyuşmazlıkta AI çözümü gizlenir ve öğretmen inceler, ikinci doğrulama açık, ücretli katman + `gemini-3.8-flash`. Tarihe bağlı fiyat ertelendi.
- Frontend:
  - httpOnly cookie + Next.js BFF, CSR.
  - Dönen refresh token.
  - Eksik backend uçları ihtiyaç anında yazılır.
  - Tamamen yeni görsel kimlik (kullanıcı onayladı, PC ve Android'de denendi); masaüstünde yan boşluk yok.
- Öğrenci çözümü silinemez, düzenlenebilir (açıklama zorunlu). Açık şikayet varken düzenleme kilitli.
- Thumbnail yüklemede üretilir; eski dosyalarda yok, istemci `thumbnailUrl ?? url` kullanır.
- frontend-agent'a Write aracı eklendi.

### Açık kalanlar / bilinenler
- Gerçek Gemini anahtarıyla duman testi kullanıcı onayı bekliyor (anahtarlar canlıyla ortak; ayrı v2 anahtarı önerildi).
- Zamanlayıcı düşük bulguları:
  - NotConfigured iken manuel tetikleme kabul ediliyor.
  - Interrupted run'da müdüre bildirim gitmiyor.
  - Boş Publish run kaydı oluşuyor.
  - MARS uyarısı.
  - Ödev bildirimleri RunId'siz.
- AI: devre kesici bellek içi (tek örnek). Usage `limitConsumed` ile kota sayacı Pending'i farklı sayıyor (normal akışta fark yok).
- Öğretmen çözümlerine şikayet kilidi uygulanmadı (görsel kanıt kaybolabilir, risk düşük).
- Thumbnail backfill komutu yok. Çözüm düzenleme geçmişi tutulmuyor.
- `ErrorResponseConvention` sezgisel: yeni `Fail.Conflict` yolları elle eklenmeli.
- Yayın (F8) için gerekli ayarlar:
  - Next.js: `TRUST_PROXY=true`, `APP_ORIGIN`, `BFF_PROXY_KEY` (backend `Bff__ProxyKey` ile aynı, ≥32 karakter).
  - Migration'lar koddan önce uygulanmalı.
  - CSP ve güvenlik başlıkları.
  - Front Door eklenirse `TRUSTED_PROXY_HOPS` güncellenmeli.
- `contracts/openapi.json` LF/CRLF uyarısı veriyor; CI diff kontrolü için `.gitattributes` gerekebilir.
- Yerel geliştirme:
  - Kullanıcının 3000 portunda dev sunucusu var.
  - Telefondan erişim için `npx pnpm@10 dev:lan` ve `http://192.168.1.117:3000`. `.env.development.local` içinde `DEV_ALLOWED_ORIGINS` var.
  - pnpm `npx pnpm@10` ile çalıştırılıyor.

### F3 frontend (öğrenci ekranları) — 2026-11-16, commit edildi
- Ekranlar:
  - pano (açık ödevler, son 7 gün soruları, haftalık puan/sıra, bildirim özeti, gerçek zil sayacı)
  - `/sorular` (sekmeler, ders/konu/kaynak filtresi URL'de, 12'lik sayfalama)
  - soru detayı (KaTeX `MathText` self-host `trust:false`, cevaplama + sayaç + sessionStorage taslağı, sonuç kartı, tartışma kilidi, çözümler + düzenleme + `pendingReport` kilidi, beğeni, şikayet, salt-okunur AI paneli)
  - yorum ağacı + `/yorumlar/[id]`
  - bildirimler
  - liderlik (haftalık/aylık, offset)
  - istatistikli profil
- Test: vitest 129; E2E Chromium + WebKit iPhone 182 geçti, 3 test hatası düzeltilip yeniden koşuldu (tam paket baştan koşulmadı); axe 0. Şikayet kilidi DB ile ilk kez uçtan uca doğrulandı.
- Reviewer turu bu aşama için YAPILMADI (kullanıcı doğrudan commit istedi).
- Bilinen küçük sorunlar:
  - Pano/liste kart önizlemesinde formüller ham (`$x^2$`) görünüyor; MathText kullanılmalı.
  - Masaüstünde dar yorum sütununda derin yanıtların "Yanıtla/Şikâyet et" düğmeleri alt alta kırılıyor.
  - Süresi dolan görsel için "üst sorguyu bir kez yeniden çek" davranışı kodda var ama E2E ile doğrulanmadı.
  - Ödev ekranları (`/odevler`, ödev detayı) "Çok yakında"; pano ödev kartları şimdilik `/sorular?ders=`'e gidiyor.
  - Görselli açıklama F4'te.
  - E2E'de Turbopack önbelleği için koşu öncesi `.next-e2e` silinmeli.
- Backend gözlemleri: öğretmen soru oluşturma 10/dk limiti testte doluyor; yanıtsız yorum silinince tamamen kayboluyor, yanıtlı yorum "[silindi]" kalıyor.
- GitHub: `origin` = github.com/skose241/LGSAPP-multi-agent. Bu oturumdaki commit'ler 2026-11-16'ya kadar push edilmemişti (kurala göre yalnız istekle push).

### Sıradaki adımlar
1. F3 küçük düzeltmeleri (kart önizlemesinde KaTeX, yorum düğmeleri) + F3 için reviewer turu.
2. F4 yükleme hattı (HEIC, küçültme, yeniden deneme, çözüm görseli, sorularım; büyük yüklemede "tekrar dene").
3. F5 AI ekranları, F6 öğretmen (önce `GET /api/students`, `/students/{id}/stats`, `needs-solution` uçları), F7 müdür operasyon, F8 sertleştirme + yayın.
4. Gerçek Gemini duman testi (onayla), Key Vault, veri taşıma, Azure deploy.

## Oturum 7 — 2026-11-16

### Önceki oturumdan not alınamayanlar
- F3 düzeltme görevi frontend-agent'a gönderilemedi; kodda değişiklik olmamıştı.
- `appsettings.Development.json` içindeki `RecoveryCodes:Pepper` yalnız geliştirme içindir ve repoda duruyor. Yayında `RecoveryCodes__Pepper` mutlaka farklı bir değer olmalı (`openssl rand -base64 48`); bu değer bir kez belirlenip sabit kalmalı.

### Bu oturumda
- F3 düzeltmeleri frontend-agent'a verildi: kart önizlemesinde KaTeX (satır sınırı korunacak, yarım formül düz metin), derin yorum düğmeleri tek satır ve "..." menüsü. Ardından tüm testler baştan koşulacak, F3 reviewer turu yapılacak, sonra commit + push.
- frontend-agent iki düzeltmeyi yaptı: `MathText` `compact` modu + `tokenizeMathPreview` (display→inline, yarım formül `$` ile birlikte düz metin kalır), yeni `ActionMenu` (Düzenle/Şikâyet et/Sil her genişlikte "..." menüsünde, Yanıtla görünür).
- F3 reviewer turu yapıldı (backend 682/682). Bulgular kapatıldı:
  - Süresi dolan görselde yeniden çekme artık yeni URL ile çalışıyor (E2E ile doğrulandı).
  - Çözüm düzenleme görseli silmiyor (`imageFileId` korunuyor).
  - Menüden açılan diyaloglarda odak dönüşü.
  - Taslaklar çıkışta ve farklı kullanıcı girişinde temizleniyor (`lgs:taslak-sahibi`).
  - Liderlik offset ≤ 12.
  - `line-clamp`/`block` çakışması giderildi.
  - Menü sol kenar taşması önlendi.
  - 409 sonrası taslak temizliği ve beğeni çift tıklama kilidi.
- Son tam koşu: lint/typecheck temiz, vitest 138, E2E 199/199 (Chromium + WebKit iPhone), axe 0.
- Açık kalanlar: `ActionMenu` sol hizalama dalı ve 409/çift beğeni E2E ile zorlanmadı; eski iOS Safari'de `line-clamp` gerçek cihazda denenmedi; E2E'de Azurite `--skipApiVersionCheck` gerekebiliyor; aynı E2E DB'de art arda tam koşu müdür girişi testlerini bozabiliyor (temiz DB ile koşulmalı).

### Sıradaki adımlar
1. F4 yükleme hattı (HEIC, küçültme, yeniden deneme, çözüm görseli, sorularım).
2. İsteğe bağlı: yayında geliştirme pepper'ının reddedilmesi için başlangıç kontrolü.

### F4 yükleme hattı — 2026-11-16, commit edildi
- Frontend:
  - Kuyruk (`packages/api/src/upload`): ≤3 eşzamanlı; sabit `clientUploadId`; 1/3/9 sn yeniden deneme, Retry-After (en az 1 sn, en fazla 120 sn), toplam 4 deneme; Retry-After'sız 429 = kota.
  - Görsel hazırlama (`lib/image`): createImageBitmap, tembel `heic-to/csp` 1.6.7, ≤2000 px JPEG 0.85, 10 MB merdiveni.
  - Ekranlar: `/soru-yukle` (çoklu, kart başına `clientRequestId`, `uploadToday` ile kalan hak ve puanlı hak), `/sorularim` (gizli soru salt okunur detaya gider).
  - Çözüm görseli: metin veya fotoğraf; değiştir/kaldır; Vazgeç'te bağlanmamış dosya silinir.
  - Sayfadan ayrılma koruması: beforeunload + bağlantı tıklaması (geri tuşu yakalanmıyor).
- Backend:
  - `me/stats.uploadToday`.
  - `POST /api/questions` `clientRequestId` idempotency (201/200/422, migration `20261116110041_QuestionClientRequestId`).
  - `POST /api/files` multipart sözleşmesi + 413.
  - Yazar kendi gizli sorusunu salt okunur görür (`isHidden`, `hiddenAt`; alt uçlar 404).
  - Cevaplamadan şikâyet (kullanıcı kararı); `WrongAnswerKey` yalnız cevaplamış öğrenciye açık (onay bekliyor).
- Reviewer turu yapıldı. Orta bulgu (Retry-After ile sonsuz yeniden deneme) ve düşük bulgular kapatıldı.
- Son tam koşu: backend 701/701, vitest 209, E2E 263 geçti / 0 hata / 3 skip (temiz DB, tek seferde).
- Açık kalanlar:
  - `heic-to` LGPL-3.0: lisans bildirimi mi, alternatif mi (kullanıcı kararı bekleniyor).
  - Gerçek iPhone'da HEIC çevrimi ve çok fotoğrafta bellek denenmedi.
  - CSP eklenirken heic-to denenmeli.
  - LocalDB'siz ortamda servis testleri sessizce geçiyor (CI için düzeltilmeli).
  - Liderlik önbelleği 60 sn ortak anahtar: yeni cevap veren öğrencinin sıra kartı 1 dk gecikebilir.
  - Belirsiz hata sonrası 409 mesajı E2E ile tetiklenmedi.

### Sıradaki adımlar
1. heic-to lisans kararı; WrongAnswerKey kuralı onayı.
2. F5 AI ekranları, F6 öğretmen, F7 müdür operasyon, F8 sertleştirme + yayın.

### F5 AI ekranları + lisans sayfası — 2026-11-16, commit edildi
- Kullanıcı kararları: heic-to için lisans bildirimi eklenecek (alternatif aranmayacak); `WrongAnswerKey` şikâyeti yalnız cevaplamış öğrenciye açık kalacak.
- F5 kapsamı tüm rollerin AI ekranları olarak tanımlandı; F6/F7'de kalanlar AI dışı ekranlar.
- Lisans:
  - `/lisanslar` herkese açık, tam eşleşme.
  - `public/licenses/*` (heic-to, libheif 1.23.7, libde265 1.0.16, GPL-3.0); bilinmeyen dosya 404.
  - `scripts/generate-licenses.mjs` prebuild'de `third-party.json` üretir.
- Öğrenci AI paneli: istek, kota, 429/503 geri sayımı, durum metinleri.
- `/ogretmen/supheli-anahtarlar` (+ detay): karar düğmeleri `permissions.canResolveDispute` ile; anahtar değiştir / dismiss, 409 bandı.
- `/yonetim/yapay-zeka`: durum, kullanım (7/30/92 gün), 8 AI ayarı.
- Backend:
  - `canResolveDispute`; `aiSuggestedOption` ve gizli AI çözümü yalnız karar yetkilisine (soru detayı, çözümler, şikâyet detayı).
  - Çözülünce `AiSuggestedOption` temizleniyor; anahtar değişim notu `answerKeyReviewNote`.
  - `auth/me`'ye `branchLessonId`/`branchLessonName`.
  - `TestDatabase` yardımcısı (seed hatasında DB siliniyor).
- E2E artık tekrarlanabilir: `npx pnpm@10 e2e:run` (`e2e/run-e2e.mjs` + `e2e/README.md`). `global-setup` Fake AI değilse durur.
- Son koşular: backend 708/708, vitest 232, `next build` başarılı, E2E (yeni betikle tek temiz koşu) 309 geçti / 0 hata / 3 skip.
- Açık:
  - LocalDB'de önceki kesilmiş koşudan 12 `LGSApp_Test_*` DB (silme onayı bekleniyor).
  - libheif/libde265 telif yılı ve heic-to wasm içindeki ek bileşenler doğrulanmadı.
  - Moderatörün kendi AI isteği ve fotoğraflı AI yolu UI'da denenmedi.
  - `next build` varsayılan `.next`'e yazar; 3000'deki dev sunucusu yeniden derleyebilir.

### Sıradaki adımlar
1. F6 öğretmen (önce B4-öğretmen `GET /api/students`, `/students/{id}/stats`, B5 `needs-solution`).
2. F7 müdür operasyon, F8 sertleştirme + yayın.

### Oturum 7 kapanış — 2026-11-16
- Commit'ler: `47767b2` (F3 düzeltmeleri), `6a81cc2` (F4), `4097462` (F5 + lisans + E2E betiği). Hepsi origin/main'e push edildi.
- Kalıcı kararlar:
  - Yazar kendi gizli sorusunu salt okunur görür.
  - Öğrenci cevaplamadan şikâyet edebilir; `WrongAnswerKey` için cevap şart.
  - heic-to tutuldu, lisans sayfası eklendi.
  - AI öneri/gizli AI çözümü yalnız karar yetkilisine.
- F5'in son düzeltme turu (canResolveDispute, route-guard, E2E betiği) ayrıca reviewer'dan geçmedi; tam E2E + birim testlerle doğrulandı. F6 öncesi istenirse kısa reviewer turu.
- Açık sorular:
  - 12 eski `LGSApp_Test_*` LocalDB veritabanı silinsin mi?
  - Liderlik önbelleği 60 sn gecikmesi kabul mü?
  - Gerçek Gemini duman testi (ayrı v2 anahtarı) ne zaman?
  - Yayında geliştirme pepper'ını reddeden başlangıç kontrolü eklensin mi?
- Gerçek cihazda denenecekler: iPhone'da HEIC çevrimi ve 10+ fotoğraf toplu yükleme (`npx pnpm@10 dev:lan`, http://192.168.1.117:3000).
- Sıradaki: F6 öğretmen ekranları (önce backend: `GET /api/students`, `/students/{id}/stats`, `GET /api/questions/needs-solution`), sonra F7, F8.

### Oturum 8 (frontend-agent, F6b düzeltme turu) — 2026-11-18
- Commit atılmadı; F6b ekranları ve bu turun değişiklikleri çalışma ağacında.
- Yapılanlar:
  - `schema.d.ts` yeniden üretildi (sonuçlara `completedCount`/`partialCount`/`missedCount`/`notStartedCount`).
  - E2E fixture'ları branşlı yazara geçti: `authorFor(lessonId)` (support/world.ts), `branchTeacher`/`setBranch` support/student-data.ts'e taşındı (ai.ts yeniden dışa aktarır). Branşsız öğretmenin kullanıldığı `student-upload` ve `licenses` ile müdür/şikâyet çözme yardımcıları aynen kaldı.
  - Yeni E2E: başka branşa ödev/soru/ödev sorusu 403; ödevde ilk yanıt kaybolup yeniden gönderme (tek soru); kayıp yanıttan sonra şık değişimi (PATCH ile D olur); sayfadan ayrılma uyarısı; konu temizleme; 60 gün aşımı.
  - Composer: `requestId` yalnız kesin 4xx'te yenilenir; belirsiz hatada `uncertain` anlık görüntü, aynı bilgilerle önce kesinleştirme, ödev yolunda `reconcileCard` (PATCH), havuz yolunda "düzenleme uygulanmadı" notu; tam tekrarda "zaten vardı" bilgisi; panel sökülürse `onDiscard` + banner + kullanılmamış dosya silme.
  - Sonuç sayfası yeni dört sayıyı kullanır; `participationSummary` silindi.
  - Konu temizleme (`topicId: 0`), geçmiş başlangıçlı taslakta yayın engeli, tarih doğrulaması (60 gün, 1 yıl, geçmiş başlangıç), sunucu 400 mesajlarının alana bağlanması, kirli form için ayrılma uyarısı (`DIRTY_LEAVE_MESSAGE`).
  - Sonuç sayfasında uzun öğrenci adı 375 px'te taşıyordu: `min-w-0` eklendi.
- iPhone "Dosya zorunludur." (webkit-iphone, aralıklı ~1/128): kök neden BULUNAMADI.
  - Elenen: canvas `toBlob` (3000 tur temiz), `page.route` etkisi (60+60 yükleme temiz), 30/dk hız sınırı (kullanıcı başına).
  - Kalan şüphe: dosyanın istemci-sunucu arasında (WebKit XHR/FormData veya BFF akışı) boşa düşmesi.
  - Sağlamlaştırma: `prepare.ts` 64 bayttan küçük çıktıyı reddedip bir kez yeniden dener; `queue.ts` dolu blob için sunucunun 400 "Dosya zorunludur" yanıtını geçici sayıp aynı `clientUploadId` ile yeniden dener. Belirtiyi örtüyor olabilir, nedeni çözdüğü kanıtlı değil; gerçek cihazda gözlem gerekir.
- Son durum: lint/typecheck/build temiz; vitest web 197, api 97; tam E2E 377 geçti / 3 skip / 0 kaldı (log: scratchpad `e2e-f6b-fix.log`).
- Açık:
  - Havuz yolunda sonradan soru düzenleme ucu yok (kayıp yanıt + şık değişimi yalnız not gösterir).
  - Ödev paneli sökülme bannerı için ayrı E2E yok.
  - Gerçek cihazda iPhone toplu yükleme gözlemi.
  - E2E çalıştırırken tüm node/dotnet süreçlerini toptan sonlandırma denenmemeli; yalnız `e2e:run` süreç ağacı sonlandırılır (dotnet.exe VS Code'a ait olabilir).
- Sıradaki: değişiklikleri reviewer'a ver, onaylanırsa commit + push (origin/main); sonra F7 müdür operasyon, F8 sertleştirme + yayın.

## Oturum 9 — 2026-11-19

### Bu oturumda yapılanlar (hepsi commit + push edildi)
- `3a97e7f` F6b öğretmen ödevleri (reviewer turu sonrası): havuz sorusunun şıkkını ödevden değiştirmek onay penceresi ister ("tüm cevapların puanı yeniden hesaplanır") + kalıcı not; boş dosya 400'ü artık `code: "file_empty"` ile tanınıyor (Türkçe mesaj regex'i kalktı); `prepare.ts` render hatalarını `console.warn` ile logluyor.
- `3ade9a4` B7a–e: zamanlayıcı durumuna `timerEnabled` + `jobs[].scheduledAt` (TR saati); AI dışı 17 genel ayar (grup `ai|genel`, `critical`, çapraz kurallar: görünür derinlik ≤ max derinlik, açıklama min ≤ çözüm max); `PUT /api/admin/users/{id}` (ad/soyad/sınıf, rol değişmez); `POST /api/admin/users/bulk` (1..100, hepsi-ya-hiç, `items[i].alan` hataları, 3/dk); `UserBanRecord` migration (`BannedAt`, `BannedByUserId`), `pendingReportCount`, `reported=true`.
- `4429df9` F7a zamanlayıcı ekranı (`/yonetim/zamanlayici` + `[id]`, onaylı elle tetik, 409 runId bağlantısı, geçmiş, pano özeti) ve F7b ders programı (`/yonetim/ders-programi`, hücre başı en fazla 20).
- `d6eb788` + `ee20a41` F7c `/yonetim/ayarlar` (ortak `settings-editor`, kritik "Dikkat" notları, sahipsiz dosya temizliği) ve F7d kullanıcı işlemleri (bilgi düzenleme, `/yonetim/kullanicilar/toplu` CSV/TSV yapıştırma + şifre tablosu yazdır/kopyala, şikâyet rozeti/filtresi `?sikayetli=1`, ban bilgisi). Reviewer düzeltmeleri: tek seferlik şifre harf/rakamla başlar; Excel formül öneki (`'`) ad/kullanıcı adı/sınıf hücrelerinde; şifreler mutation cache'ten temizlenir; `gunlukSoruYuklemeLimiti` kritik (0 = yükleme kapalı, migration `SettingUploadLimitDescription`); yeniden ban ilk kaydı korur; yalnız tekil ad ihlali 409; sınıf yalnız öğrencide; E2E'de AdminSettings/BulkUserCreate/SchedulerTrigger hız sınırları 10000.
- `454d128` F8a/F8d sertleştirme: `ProductionGuards` (Development dışında dev pepper parmak izi, UseDevelopmentStorage, localdb, PermitLimit>1000, bekleyen migration reddi), HSTS/nosniff/JSON no-store, `/health/live`, `/health/ready`, `HttpsRedirection:Enabled`; nonce'lu CSP (varsayılan report-only, `CSP_REPORT_ONLY=false` zorlayıcı, `CSP_IMG_HOSTS`), `/csp-report`, `/healthz`, zod `jitless`, E2E'de CSP ihlali testi kaldırır; `LGSAPP_TEST_SQL`/`LGSAPP_TEST_REQUIRE_DB`; `seed-reference-data [--dry-run]` komutu; `backend/README.md` ilk kurulum sırası.
- `ca6f323` F8b/F8c: `.github/workflows/ci.yml` (backend+mssql konteyneri, frontend, openapi/schema diff, açık paket, Linux Production smoke) ve `deploy.yml` (workflow_dispatch, OIDC, `environment: production`); `infra/` Bicep (B1, SQL Basic, Storage, Key Vault referansları, purge protection açık, basic auth kapalı, bütçe 50$/80$; `az bicep build/lint` temiz, v0.49.2); `scripts/deploy/*.ps1` (+ smoke/ci bash); `AppDbContextFactory` (migration bundle host kurmadan, `ConnectionStrings__DefaultConnection` ile); Api csproj dev appsettings'i publish'e almaz. Reviewer düzeltmeleri: çözülmemiş `@Microsoft.KeyVault(` metni açılışta reddedilir (7 sır), readiness 20 sn önbellek, `/csp-report` güvenilir IP + toplam 300/dk + istek başına 3 log, referans veri tek transaction + tr-TR eşleme.
- Son tam koşular: backend 852/852, vitest api 108 + web 252, E2E 463 geçti / 3 skip / 0 hata.

### Kalıcı kararlar
- F7: toplu kullanıcı oluşturma var; ad/soyad/sınıf düzenlenir, rol değişmez; tüm AI dışı ayarlar açık (kritikler notlu); şikâyetliler için rozet+filtre, ayrı ekran yok; zamanlayıcının çalışmadığı geçmiş gün için üretim yok.
- F8: eski sistemden HİÇBİR veri taşınmayacak (açık ödevler elle yeniden kurulacak; taşıma aracı ve eski şifre doğrulayıcısı yazılmayacak). Azure SQL Basic 5 DTU. İlk yayın yerel az CLI betikleri + Key Vault, sonra GitHub Actions.
- Gemini anahtarları: geliştirmede user-secrets (`Ai:Gemini:QuestionApiKey`, `Ai:Gemini:SolutionApiKey`), yayında Key Vault referansı (`Ai__Gemini__*`). v2 için canlıdan ayrı iki anahtar açılması önerildi.
- "Tetikleme ucunda IP kısıtı" notu GEÇERSİZ: v2'de zamanlayıcı API içinde, dış HTTP tetiği yok.
- Kod: E2E'de Windows'ta `-g` ile Türkçe karakter kullanılmaz; paralel ajanlar `git stash` kullanmaz.

### Durum / açık sorular
- Azure aboneliği yok: Azure for Students portalında okul adı alanı siliniyor. GitHub Student Developer Pack doğrulandı, ~72 saatte aktifleşecek; sonra Azure for Students GitHub üzerinden açılacak.
- İlk GitHub Actions CI koşusu (`ca6f323`): Production duman testi dahil yeşil (kullanıcı Actions sekmesinden doğruladı). E2E işi yalnız workflow_dispatch ile çalışır, "taslak" görünmesi beklenen. `gh` kuruldu (`C:\Program Files\GitHub CLI\gh.exe`), henüz `gh auth login` yapılmadı.
- Kullanıcı eski Postgres `ConnectionStrings__DefaultConnection` kullanıcı ortam değişkenini sildi (2026-11-19).
- Bilinen riskler `infra/README.md` "Bilinen riskler ve yayın sonrası adımlar": SQL "Azure hizmetlerine izin ver" + sunucu yöneticisiyle bağlantı (sonra MI + contained user), web'in kasa kapsamında Secrets User olması, CSP report-only → zorlayıcı geçiş, GitHub `production` environment onaylayıcı + yalnız main kuralı elle kurulmalı.
- Doğrulanmayanlar: `DOTNETCORE|10.0` App Service desteği, bölge kısıtı, `deploy.yml`/pwsh 7, eski iOS'ta `'wasm-unsafe-eval'` (HEIC), gerçek iPhone toplu yükleme ("Dosya zorunludur" kök nedeni hâlâ bilinmiyor), toplu ekleme taşma testinin kök nedeni (zamanlama çıkarımı).
- Küçük açıklar: profil düzenlemede istemci sürümü yok (bayat form tespiti yok); `seed-reference-data` ada göre eşler (ad değişirse orijinali yeniden ekler); `reported` sorgu parametresi UI'da kullanılmıyor; şikâyet bağlantısı kullanıcıya göre filtrelemiyor.

### Sıradaki adımlar
1. `gh auth login` sonrası CI koşularını `gh run list` ile izle; E2E taslağını bir kez elle çalıştırıp doğrula.
2. Abonelik açılınca F8e (`scripts/deploy/first-install.ps1`, `infra/README.md`): bütçe → bicep what-if → deploy → set-secrets → migrate + seed-reference-data → API (Seed__) → web → ilk müdür girişi → Seed değişkenlerini sil → Gemini duman testi (ayrı v2 anahtarı, onaylı) → gerçek iPhone HEIC/toplu yükleme → birkaç gün sonra CSP zorlayıcı.
3. Yayın sonrası: SQL managed identity geçişi, web Key Vault rol kapsamı, alan adı (önce azurewebsites.net pilot, sonra netpesinde.com).

## Oturum 10 — 2026-11-20

### Bu oturumda yapılanlar
- Yerel, kalıcı olmayan demo ortamı anlatıldı (betik yazılmadı): ayrı `LGSApp_Demo` LocalDB veritabanı (açılışta ve kapanışta `dotnet ef database drop --force`), `%TEMP%\lgs-demo-azurite` klasöründe Azurite (kapanışta silinir), backend `Ai__Provider=Fake`, `Scheduler__Enabled=false`, `Seed__AdminUserName/Password`, `Bff__ProxyKey` = web `.env.development.local` BFF_PROXY_KEY; web `npx pnpm@10 dev`. Asıl `LGSApp` veritabanına dokunulmaz.
- `7724bc5` arayüz metin revizyonu (154 frontend dosyası, push edildi):
  - Kısa yazılar (başlık, menü, buton, sekme, tablo başlığı, etiket, rozet, dialog/boş durum başlığı, kısa aria-label, sayfa başlığı) her kelimenin baş harfi büyük; bağlaçlar (ve, ile, veya, ya da, ki, de/da) küçük; kısaltmalar aynen.
  - Tüm rollerde tam cümleler "siz" hitabıyla; cümleler Title Case değil.
  - `packages/api` içindeki görünen etiket/mesajlar da kapsamda.
  - Doğrulama: lint/typecheck temiz, vitest api 108 + web 252, build 35/35; tam E2E 457 geçti / 3 skip / 5 kaldı (2'si metin kaçağı, düzeltildi; 3'ü makine uykusu) → kalan 5 testin tekrarı 8/8 geçti. Reviewer: kritik yok; `--list` HEAD ve sonrası 466 test (kayıp yok).

### Kalıcı kararlar
- Arama placeholder'ları "…arayın" biçiminde kalır.
- Kısa aria-label'lar Title Case.
- Tablo hücresi/değer niteliğindeki metinler ("Henüz cevap yok", "Konu seçilmemiş", "Görselli soru") cümle yazımında kalır.
- Kişiye hitap etmeyen nötr cümlelere dokunulmaz.

### Açık kalanlar (kullanıcı "şimdilik yeterli" dedi)
- Reviewer'a göre kısa aria-label ve "…yükleniyor" etiketlerinin bir kısmı hâlâ Title Case değil (ör. `bulk-users-page.tsx:379` "CSV dosyası seç", `users-list.tsx:86` "Rol filtresi", `assignment-add-panels.tsx:388` "Soru ekle"; tarama: `grep -rnoE "aria-label=..." apps/web/src`). E2E `getByLabel` seçicileri birlikte güncellenmeli.
- `scheduler-page.tsx:105` rozet "Zamanı geldi" → "Zamanı Geldi".
- Backend'den gelen kullanıcı mesajları "siz" hitabı açısından taranmadı (örneklemde zaten "siz"li).
- E2E uzun koşuda makine uykuya geçerse testler zaman aşımına düşüyor; koşu sırasında uyku kapatılmalı.
- Demo ortamı için tek komutluk betik (Ctrl+C'de DB + Azurite temizliği, yalnız `LGSApp_Demo` adına izin) önerildi, yazılmadı.

### Sıradaki adımlar
1. İstenirse kalan aria-label/rozet Title Case turu + backend mesaj taraması.
2. Önceki listedeki sıra geçerli: `gh auth login` → CI izleme; abonelik açılınca F8e ilk kurulum.

## Oturum 11 — 2026-11-24 / 2026-11-25

### Bu oturumda yapılanlar
- Kullanıcı "1 sayfadaki soruları ayırma" ve "PDF'ten hızlı yükleme" modüllerini sordu: Oturum 5'te tasarlanmış (`tasarim-domain.md:222-228`) ama hiç uygulanmamış, sıradaki adımlardan düşmüştü. F9 olarak açıldı.
- Plan agent F9 planını çıkardı → `.claude/plan-f9.md` (F9a elle çerçeveleme, F9b pdf.js metin katmanı, F9c Gemini; kullanıcı kararları dosyanın sonunda).
- `785a1db` F9a (push edildi): ödev detayında 4. panel "Sayfadan Ayır", havuzda "Fotoğraflar | Sayfadan Ayır"; PDF ≤60 sayfa/50 MB veya ≤20 fotoğraf; çerçeve çiz/taşı/boyutlandır, cevap anahtarı yapıştırma, 20'lik parti aktarımı, sessionStorage taslak; `pdfjs-dist` 6.5.438 (GHSA-hq66-cqwq-w95j nedeniyle 5.x'ten yükseltildi), varlıklar prebuild ile `public/pdfjs/<sürüm>/`; CSP değişmedi; ödev panellerinde ortak 200 kapasite. Reviewer: tam E2E 475 geçti (1 flaky admin-scheduler), 40 sayfa PDF'te sızıntı yok.
- F9b (COMMIT EDİLMEDİ, çalışma ağacında): "Otomatik Bul" (Bu Sayfa/Tüm Sayfalar), kesikli öneriler + kabul/ret, düşük güven rozetleri, cevap anahtarı sayfası tespiti ("Cevapları Uygula"), "Kenarları Sıkılaştır" (ilerleme + İptal), ders bölümleri (`sections.ts`: numara 1'e dönünce yeni bölüm, anahtar bölüme göre). Reviewer turu (O1–O3, D1–D7) düzeltildi.
- Gerçek kitapçıkla sınama: `C:\Proje\lgs-deneme.pdf` (2026 LGS sayısal, 33 sayfa, Mat 20 + Fen 20, s33 cevap anahtarı; repoya KONMAZ). İlk sonuç 37/40 numara, 0/40 anahtar → düzeltme turundan sonra 40/40 numara + bölüm, 40/40 anahtar, kapak/boş/kural/anahtar sayfalarında öneri yok, tüm sayfalar "high". Test: `src/lib/pdf/real-pdf.test.ts` (yalnız `LGS_REAL_PDF=C:/Proje/lgs-deneme.pdf` verilince koşar).
- Son doğrulama (2026-11-25, ben koştum): vitest 431 geçti + 1 skip (real-pdf env yoksa), lint/typecheck/build temiz; E2E teacher-page-split 33 geçti/1 skip (agent'ın 23:01 koşusu, sonrasında kod değişmedi). Görsel kontrol betiği: scratchpad `realpdf/render.mjs` (geçici, kaybolabilir).
- "Taslakta kalanlar" taraması yapıldı (aşağıda).

### Kararlar
- F9 yeri mevcut ekranlar; ortak metin birleştirme sonraya; PDF 60 sayfa/50 MB, 20'lik parti; F9c'de Gemini'ye sayfa gönderimi kabul + telif/gizlilik notu, mevcut `QuestionApiKey`, öğretmen 30/global 200 sayfa/gün; AI şıkkı yalnız öneri çipi; mobil F9 dışında; metin tespiti düğmeyle.
- F9a/F9b backend/şema değiştirmez; F9c bir veri migration'ı (yalnız InsertData) + `AiQuotaService` kapsam refactor'u gerektirir, F8e sonrası.

### Açık kalanlar
- F9b commit edilmedi. Commit öncesi: (1) iki sütunlu sayfada sağ sütun kutusu sol sütun metninden ince şerit alıyor (s19'da "hava", "yapraklar" uçları) — sağ sütun kutusu sütun numarasının hemen solundan başlamalı; (2) reviewer son iki tura (düzeltmeler + gerçek PDF uyarlaması) bakmadı; (3) bu turda student-upload/teacher-assignments E2E tekrar koşulmadı (composer'a dokunulmadı).
- F9b bilinen sınırlar: numarasız ortak metin önceki soruya girer; taranmış PDF ve görsel cevap anahtarı F9c'ye kalır; eşikler tek gerçek kitapçıkla ayarlandı (yayınevi denemeleriyle de sınanmalı).
- F9a/F9b gerçek iPhone: büyük PDF bellek, parmakla Çiz/Kaydır, HEIC sayfa fotoğrafı, eski iOS'ta pdf.js wasm → F8e cihaz testine ekle. Kırpım dosya adı sunucuya gitmiyor.
- powercfg: reviewer izinsiz `standby-timeout-ac 0` yaptı (fişte uyku "hiçbir zaman"); eski değer bilinmiyor. Geri almak için `powercfg /change standby-timeout-ac 30`. Ajanlara sistem ayarı değiştirmemeleri söylendi.
- Bir arka plan ajanının son raporu harness aksaklığıyla iletilmedi; sonuçlar elle doğrulandı.
- Taslakta kalan diğer konular (F9'dan sonra):
  - Mobil uygulama (React Native) hiç başlamadı (`frontend/apps/mobile` yok).
  - Puan "yeniden hesapla" ucu (`tasarim-domain.md:132`), çözüm düzenleme geçmişi, öğretmen çözümlerine şikâyet kilidi.
  - Gemini tarihe bağlı fiyat (2027-01-01) — Ocak'tan önce.
  - Zamanlayıcı reviewer turu hiç yapılmadı + 5 düşük bulgu (NotConfigured'da manuel tetik, Interrupted bildirimi, boş Publish kaydı, MARS, RunId'siz ödev bildirimi); graceful shutdown Interrupted denenmedi.
  - Açık ödevde beğeni görünürlüğü (2 madde); profil bayat form; `seed-reference-data` ada göre eşleme; `reported` parametresi; şikâyet bağlantısı filtresi; kalan aria-label Title Case.
  - Gerçek Gemini duman testi, fotoğraflı AI yolu uçtan uca, gerçek iPhone toplu yükleme ("Dosya zorunludur").
  - CLAUDE.md "yetkisiz erişim" zamanlayıcı sorunu v2'de geçersiz (zamanlayıcı API içinde) — CLAUDE.md'den çıkarılabilir.
  - Demo ortamı betiği.

### Sıradaki adımlar
1. F9b: sağ sütun şerit düzeltmesi (frontend-agent) → reviewer kısa tur → kullanıcı onayıyla commit + push.
2. F9c (Gemini tespiti) — F8e sonrası önerilir; plan `plan-f9.md`.
3. Azure F8e ilk kurulum (önceki liste) + gerçek iPhone testine F9 akışları.
4. Sıra: zamanlayıcı reviewer + küçük hatalar → Gemini fiyat güncellemesi → mobil uygulama.

### Oturum 11 eki — 2026-11-25 (F9b kapanışı)
- Sağ sütun şerit hatası düzeltildi (`text-detect.ts`): metin parçaları sütunlara tek tek atanıyor (`CONTINUATION_GAP` 0.012), kutu kenarları komşu sütun parçalarına göre sınırlanıyor (`NEIGHBOR_PAD` 0.003). Gerçek PDF testine kenar-kesişim kontrolü eklendi (düzeltme öncesi 39 kesişim, sonrası 0).
- Reviewer: kritik/orta bulgu yok. vitest 433/433 (gerçek PDF ile), typecheck, eslint, build temiz; E2E (teacher-page-split, student-upload, teacher-assignments) 137 geçti / 1 skip / 0 hata.
- F9b commit + push edildi.
- Açık düşük bulgular:
  - L1: `text-detect.ts:382` çok kısa veya sayfa altına yakın soru kutusu uyarısız düşüyor (gap issue eklenmeli).
  - L2: `text-detect.ts:315-331` iki yana yaslı sol sütun satırının son kelimesi sağ sütuna sayılıp kırpılabilir (koddan çıkarım).
  - L3: numaranın solundan başlayan geniş şekil etiketinin sol ucu ~%1 kırpılabilir.
  - L4: sütunda tek sola taşan satır tüm sütun kutularını genişletiyor (eskiden beri).
  - L5: `answer-key-detect.ts:136-138` başlıkla aynı hizada başka sütun metni varsa başlık tanınmayabilir/o hizadaki cevaplar kaybolabilir.
- Sıradaki: F9c (F8e sonrası) / Azure F8e; yayınevi denemeleriyle F9b eşik sınaması.

## Oturum 12 — 2026-11-25

### Bu oturumda yapılanlar
- F9b commit + push: `2b09ae2` (sağ sütun şerit düzeltmesi dahil; reviewer: kritik/orta yok; vitest 433/433 gerçek PDF ile, E2E 137 geçti).
- Canlı (Azure, `lgsapp-rg`, Germany West Central): müdür girişi, öğretmen/öğrenci hesapları, ilk akşam soru üretimi oluşmuştu. Web paketi F9 öncesindendi → `publish-web.ps1` + `deploy-apps.ps1 -Target web` ile yeniden dağıtıldı; "Sayfadan Ayır"/PDF canlıda çalışıyor.
- Kullanıcı v2 için ayrı 2 Gemini anahtarı oluşturup yükledi; maliyet dert değil (hafızada).
- Günlük: web ve API'de `--docker-container-logging filesystem` açıldı. Kayıtlar Kudu'dan: `az account get-access-token` ile `https://<app>.scm.azurewebsites.net/api/logs/docker` ve `/api/vfs/LogFiles/<dosya>` (az webapp log download takılabiliyor).
- CSP zorlayıcı moda alındı (`CSP_REPORT_ONLY=false`; `/giris` başlığı doğrulandı; `/login` 307 olduğu için başlık taşımaz). Yerel `infra/main.parameters.json` `cspReportOnly=false`. Tek canlı rapor: `/sifre-degistir` media-src data: (tarayıcı eklentisi, zararsız).
- Çöküş (~10.20–13.30): B1'de bellek %80+ iken art arda ayar değişikliği yeniden başlatmaları → API 230 sn açılış denetimini geçemedi, başka VM'e taşındı. Plan B2'ye yükseltildi (yerel `main.parameters.json` `appServiceSku=B2`). B2'de API açılışı ~48 sn.
- Zamanlayıcı reviewer turu (ilk kez) → backend-agent düzeltmeleri → kısa reviewer → `97fb942` commit + push + API canlıya dağıtıldı (14.30):
  - K1: kira süresi dolmuş Running kaydı planlayıcıyı kilitlemiyor (ölü sayılır, ClaimAsync devralır).
  - O2: Interrupted deneme sayacından muaf, 2 dk sabit bekleme, günde 9 üst sınır; Generate tükenirse Complete devreye girer.
  - AI yapılandırılmamışken manuel Generate/Complete 409.
  - Kesinti/devralma/AI hesabı yok için müdür bildirimi (mevcut `GenerationReport` türü; migration yok).
  - `WEBSITES_CONTAINER_STOP_TIME_LIMIT=90` (bicep + canlı API ayarı).
  - Yeni testler: SchedulerRunStoreTests (6), SchedulerServiceTests; backend 881/881.
- GitHub Actions dağıtım kurulumu:
  - Entra uygulaması `lgsapp-github-deploy` (appId `93e56851-4b82-456c-80ed-6a79f3badff8`), federated credential `repo:skose241/LGSAPP-multi-agent:environment:production`.
  - Roller: `lgsapp-rg` Contributor; Key Vault Secrets User yalnız `Sql-ConnectionString` sırrında.
  - GitHub `production` ortamı: onaylayıcı skose241, yalnız `main` dalı; ortam sırları AZURE_CLIENT_ID/TENANT_ID/SUBSCRIPTION_ID.
  - Depo PUBLIC (koruma kuralları bu yüzden ücretsiz).

### Kararlar
- Barındırma: bu ay Azure 200$ deneme kredisi (öğrenci kampanyası açılamadı), B2. ~2026-12-09'da kullanım/maliyet verisiyle Hetzner Cloud VPS geçişine karar (CLAUDE.md barındırma kararını değiştirir). Kullanıcı bellek/log kısıtı istemedi.
- Canlıda ayar değişiklikleri tek seferde, sakin saatte; 17.30–19.00 arası dağıtım/ayar yok.
- Yayına alma: 2026-11-25 16.00. Alan adı sonra netpesinde.com'a bağlanacak (kullanıcı yapacak).

### Açık kalanlar
- GitHub Actions ilk deneme koşusu YAPILMADI (20.04'e kurulan zamanlama oturum kapanınca iptal). Yapılacak: akşam görevlerinin bittiğini ve sağlığı kontrol et → `gh workflow run deploy.yml -R skose241/LGSAPP-multi-agent -f resource_group=lgsapp-rg` → kullanıcı "Review deployments" ile onaylar → sağlık denetimi. Görev saatlerinde (17.30–19.00) tetikleme. Onaydan sonra yerel betikler yerine Actions kullanılacak.
- Bu akşamki görev sonuçları (17.30/18.15/19.00) ve B2 bellek/CPU kontrol edilmedi.
- iPhone gerçek cihaz testi (HEIC, 10+ toplu yükleme, PDF Sayfadan Ayır/Otomatik Bul, parmakla çizim; zorlayıcı CSP altında, iOS ≤15 `'wasm-unsafe-eval'` riski) — kullanıcı gün içinde yapacaktı, sonucu sorulmalı.
- Zamanlayıcı düşük bulguları: D2 (iki örnek kısa işte çift kayıt), D3 (gece yarısı sonrası yayın ertesi güne), D4, D5, D6 (TurkeyTime yalnız TimeZoneNotFound yakalar), D7 (GetStatusAsync ~10 sorgu), saat kayması >135 sn devralma riski, bulgu 3 (boş Publish kaydı) ve 5 (RunId'siz ödev bildirimi); kesinti bildirimi Publish/ödev için de "Soru Üretim Raporu" etiketiyle görünüyor.
- F9b düşük bulgular L1–L5 (Oturum 11 eki).
- EF Core SQL sorguları Production'da Information seviyesinde günlüğe yazılıyor (kullanıcı kısıt istemedi; günlük hacmi izlenmeli).
- Depo public: okul sistemi için private yapılması kullanıcıya önerildi (private'ta ortam koruması GitHub Pro ister).
- Yayın sonrası güvenlik: SQL managed identity + contained user, web Key Vault rol kapsamı daraltma.
- CLAUDE.md "yetkisiz erişim" zamanlayıcı sorunu v2'de geçersiz — kullanıcı onayıyla çıkarılabilir.
- Önceki listeden: Gemini tarihe bağlı fiyat (2027-01-01 öncesi), F9c, mobil uygulama, demo betiği, küçük UI açıkları.

### Sıradaki adımlar
1. Oturum açılınca: akşam görev sonuçları + B2 metrikleri → GitHub Actions deneme koşusu (kullanıcı onaylı).
2. iPhone test sonucunu sor; sorun varsa Kudu günlükleri.
3. Gemini fiyat güncellemesi; zamanlayıcı düşük bulguları; F9c.
4. ~2026-12-09: Azure kullanım/maliyet raporu → Hetzner kararı.

## Oturum 13 — 2026-11-26

### Bu oturumda yapılanlar
- Akşam görevleri (25.11) kontrol edildi: 17.30'da 5 soru üretildi, 18.15'te tamamlama çalıştı, 19.00'da 5 soru yayınlandı, 00.05'te ödev işi koştu. B2'de bellek %60–66, CPU ort. %6.
- GitHub Actions ilk dağıtım: Entra'ya ikinci federated credential eklendi (`github-production-immutable`, subject `repo:skose241@192023701/LGSAPP-multi-agent@1452621668:environment:production`; GitHub artık kimlik numaralı subject gönderiyor). `694f83c`: tüm aksiyonlar Node 24 sürümlerine yükseltildi, deploy.yml'de `az sql server firewall-rule delete --yes` hatası (kural silinmiyordu) düzeltildi; artık silme başarısızsa iş hata verir. Bundan sonra dağıtım yalnız `gh workflow run deploy.yml ... -f resource_group=lgsapp-rg` + Review deployments.
- `ad314db`: Gemini fiyatı tarihe bağlı (`Ai:Pricing:<model>:Changes`, 2027-01-01T00:00Z'den itibaren 1.50/7.50 USD/MTok; Google sayfasından doğrulandı). Fiyat yalnız raporlamada; kullanım sınırları adet bazlı. Zamanlayıcı: D6 (TurkeyTime sabit UTC+3 yedeği), D2 (timer claim kilit içinde Plan ile yeniden doğrulanır, NotDue 2 sn), D3 ("N yeni soru yayında"), "Ödev açma/kapatma", elle tetiklenen kesinti bildirimi, bildirim etiketi "Zamanlayıcı Raporu". Bırakılanlar: boş Publish kaydı, RunId'siz ödev bildirimi, D7, saat kayması, MARS. D4/D5'in ayrıntısı kayıptı.
- Alan adı: web uygulaması `https://netpesinde.com`'da (eski CFML sunucusu kullanıcı tarafından kapatıldı). `7d38dbc`: bicep `webCustomDomainStage` none/bind/certify/secured, yönetilen sertifika (2027-05-26'ya kadar, Azure yeniler), `CANONICAL_HOST` ile www ve azurewebsites → 308 netpesinde.com (/healthz, /api muaf). DNS Cloudflare'de gri bulut: `@` A 20.79.106.31, `www` CNAME lgsapp-web-b4okhw.azurewebsites.net, `asuid`/`asuid.www` TXT. API azurewebsites'te kaldı. Yerel `infra/main.parameters.json` (gitignored) `secured` + `webCanonicalHost=netpesinde.com` — altyapı dağıtımlarında böyle kalmalı (hafızada). Bicep tüm app settings'i yeniden yazdığı için altyapı dağıtımından sonra `az webapp log config --docker-container-logging filesystem` (api, web) tekrar çalıştırılmalı.
- Öğrenci testi (canlı, `ai-öğrenci`) ve öğretmen testi (canlı): tüm modüller çalıştı; CSP ihlali yok. Bulunanlar: AI çözümü iki kez görünüyordu (düzeltildi), profil sekme başlığında sayfa adı eksik (açık). Kullanıcı "pdf-deneme" ödevinin anahtarını bilerek yanlış girmişti.
- Veritabanı sıfırlandı (`26f1070`): 6 ders / 73 konu (8. sınıf 2018 programı; 2026-27'de 8. sınıf Maarif Modeli'ne geçmiyor), `SISTEM` ayrılmış adlardan çıkarıldı, `reset-database` sunucu komutu (dry-run, ad doğrulaması, tek transaction), `scripts/deploy/reset-data.ps1` (`-BlobsOnly` dahil), `set-seed.ps1 -AdminFirstName/-AdminLastName`. Kullanıcı sıfırlamayı ve `sistem` (Semih Köse) müdür hesabını kendisi kurdu, seed ayarlarını sildi; gerçek müdür hesabı arayüzden ("Yeni Müdür") oluşturuldu. Blob kabı boş, konular 73/73 doğrulandı.
- `8799686` PWA: manifest, ikonlar (192/512/maskable/apple 180), yalnız çevrimdışı sayfası sunan sw.js, panoda "Ana ekrana ekle" ipucu. Canlıya alındı, kullanıcı mobil görünümü onayladı.
- `1744657`: AI çözümü artık yalnız üst panelde (Yorumlar/Şikâyet Et panelde). Yerel demo ortamı `frontend/apps/web/demo` (`npx pnpm@10 demo:run [--keep] [--no-shots]`): LocalDB `LGSApp_Demo`, Azurite, Fake AI, kurgusal veri, 71 ekran görüntüsü `.demo/shots` (gitignored).
- Tanıtım slaytları (Artifact, şu an yalnız kullanıcıya açık): Öğrenci https://claude.ai/artifact/R93ocbMtEUqD4wdFY1qhbC (14 slayt), Öğretmen https://claude.ai/artifact/9ddwmMQVpqbfDueSmVp6VA (15 slayt).

### Kararlar
- Konu listesi MEB programının konu düzeyinde (Fen alt konuları, Türkçe LGS başlıkları; Yazma/Dinleme alınmadı).
- Sahibin müdür hesabı kullanıcı adı `sistem`; gerçek müdür ayrı hesap.
- Mobil uygulama: React Native yerine şimdilik PWA. Push bildirimleri kapsam dışı.
- Demo verisi yalnız yerelde; canlıya demo verisi girmez.

### Açık kalanlar
- `1744657` (AI çözümü tek görünüm) canlıya dağıtılmadı.
- Sıfırlamadan sonra Ders Programı tüm günler 0 → 17.30 üretimi soru üretmez; müdür ders programını ve Ayarlar'ı (AI hakları vb.) girmeli. Öğretmen/öğrenci hesapları açılacak, kurtarma kodları oluşturulacak.
- Fen "Basınç" alt konuları (Katı/Sıvı/Gaz) kaynakla teyit edilmedi; Fen öğretmenine gösterilmeli.
- Slaytlar paylaşılmadı (Share menüsü); kullanıcı inceleyecek.
- Profil sayfası sekme başlığı; soru çöz listesinde küçük görseller ortadan kırpılıyor; liderlikte kullanıcı adı görünüyor (ad soyad değil).
- Test hesabı `ai-öğrenci` silindi (DB sıfırlandı); kullanıcıya verdiği şifre artık geçersiz.
- Önceki listeden: F9c, F9b L1–L5, zamanlayıcı kalan düşükler, EF SQL Information log hacmi, depo public (private önerildi), SQL managed identity, Hetzner kararı (~2026-12-09), CLAUDE.md "yetkisiz erişim" maddesi.

### Sıradaki adımlar
1. `1744657` dağıtımı (17.30–19.00 dışında) ve canlıda AI çözümünün tek göründüğünü kontrol.
2. Ders programı/ayarlar girildi mi; ertesi gün akşam görev sonuçlarını kontrol.
3. Slayt geri bildirimi; gerekirse düzeltme.
4. ~2026-12-09 Azure maliyet raporu → Hetzner kararı.
