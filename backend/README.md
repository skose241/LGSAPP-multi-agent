# LGSApp Backend

## Ortamlar

- Geliştirmede API `ASPNETCORE_ENVIRONMENT=Development` ile çalıştırılır (`launchSettings.json` bunu kendisi verir). Ortam verilmezse uygulama Production sayılır ve üretim korumaları devreye girer.
- Sunucu komutları (`reset-mudur-password`, `seed-reference-data`) da ortam verilmezse Production sayılır; geliştirmede `ASPNETCORE_ENVIRONMENT=Development` ile çalıştırın.

## Üretim başlangıç korumaları

Development dışında aşağıdakilerden biri varsa uygulama Türkçe hata yazıp çıkış kodu 1 ile durur:

- Geliştirme `RecoveryCodes:Pepper`, `Jwt:Key` (DEV-ONLY), `Ai:Provider=Fake`, `DevTime:OffsetMinutes`
- Boş veya `UseDevelopmentStorage=true` içeren `Storage:ConnectionString`
- `(localdb)` içeren bağlantı dizesi
- 1000'i aşan `RateLimiting:*:PermitLimit`
- Uygulanmamış EF migration (uygulama başlangıçta migration çalıştırmaz; migration koddan önce ayrı adımda uygulanır)

`Cors:AllowedOrigins` içinde localhost varsa yalnızca uyarı loglanır.

## İlk kurulum sırası (yayın)

Eski sistemden veri taşınmaz; boş veritabanıyla temiz başlangıç yapılır. Sıra önemlidir:

1. Migration: `dotnet ef database update` (veya migration betiği). Uygulama başlangıçta migration uygulamaz; bekleyen migration varsa hem API hem sunucu komutları hata verip durur.
2. Referans veri: `dotnet LGSApp.Api.dll seed-reference-data --dry-run` ile ne ekleneceğine bakın, ardından `dotnet LGSApp.Api.dll seed-reference-data` çalıştırın. Komut tekrar çalıştırılabilir; var olan ders/konuya dokunmaz. Bağlantı `ConnectionStrings__DefaultConnection` ile verilir.
3. İlk müdür: API ilk açılışta şu ortam değişkenleriyle müdür hesabını oluşturur: `Seed__Enabled=true`, `Seed__AdminUserName`, `Seed__AdminPassword` (tek seferlik şifre; parola kurallarına uymalıdır). İlk girişte şifre değiştirmek zorunludur. `Seed:Enabled` varsayılanı yayında `false` olduğundan açıkça `true` verilmelidir.
4. Seed şifresinin kaldırılması: müdür ilk girişle şifresini değiştirdikten sonra `Seed__AdminPassword` (ve `Seed__Enabled`) ortam değişkenlerini silip uygulamayı yeniden başlatın. Değerler kalırsa ve müdürün kullanıcı adı değişir ya da hesap silinirse, bilinen ilk şifreyle yeni bir müdür hesabı yeniden oluşur.

Müdür şifresini kaybederse son çare: `dotnet LGSApp.Api.dll reset-mudur-password <kullaniciAdi>`.

Sunucu komutları `ProductionGuards` değerlendirmesinden geçmez (Pepper, localdb, Storage gibi API yapılandırma korumaları uygulanmaz); yalnızca veritabanı bağlantısı ve bekleyen migration denetlenir. Yine de komutlar altyapı servislerini yüklediği için `RecoveryCodes__Pepper` (en az 32 bayt, base64) ve `ConnectionStrings__DefaultConnection` tanımlı olmalıdır; pepper yayındaki API ile aynı değer olmalıdır.

## Azure yayını

Altyapı (Bicep), yayın betikleri ve CI/CD için `infra/README.md` dosyasına bakın. Migration paketi (`dotnet ef migrations bundle`) hem üretilirken hem çalıştırılırken `ASPNETCORE_ENVIRONMENT=Development` ile çalıştırılmalıdır; Production ortamında `ProductionGuards` ana bilgisayarın kurulmasını engeller. Yayın paketinden `appsettings.Development.json` çıkarılır (`scripts/deploy/publish-api.ps1`).

## Ayarlar

- `HttpsRedirection:Enabled` (varsayılan `true`): App Service "HTTPS Only" kullanılıyorsa `false` yapılabilir.

## Sağlık uçları

- `/health` ve `/health/live`: bağımlılıksız canlılık.
- `/health/ready`: veritabanı ve blob depolama denetimi (503 dönebilir).

## Testler

- Test veritabanı sunucusu `LGSAPP_TEST_SQL` ile verilir (varsayılan `(localdb)\MSSQLLocalDB`; `=` içeriyorsa tam bağlantı dizesi öneki sayılır).
- `LGSAPP_TEST_REQUIRE_DB=true` iken sunucuya erişilemezse testler sessizce atlanmaz, hata verir (CI için önerilir).
