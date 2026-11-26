# LGSApp Azure yayını (altyapı, betikler, CI/CD)

Hedef: tek App Service planında (Linux B1) API + web, Azure SQL (Basic 5 DTU), Storage (özel `images` konteyneri), Key Vault (RBAC). Veri taşınmaz; boş veritabanıyla temiz başlangıç yapılır.

## Dosyalar

| Yol | Amaç |
| --- | --- |
| `infra/main.bicep`, `infra/modules/*.bicep` | Kaynak grubu kapsamında altyapı |
| `infra/budget.bicep` | Abonelik kapsamında aylık bütçe (50 ve 80 uyarıları) |
| `infra/main.parameters.example.json` | Örnek parametreler (sır yok). Kopyalayıp `infra/main.parameters.json` yapın |
| `scripts/deploy/*.ps1` | Yerel ilk yayın betikleri |
| `scripts/deploy/smoke.sh`, `ci-start-*.sh` | CI duman testi ve servis başlatıcıları |
| `.github/workflows/ci.yml` | Push/PR doğrulaması |
| `.github/workflows/deploy.yml` | Elle tetiklenen, onaylı yayın (OIDC) |

## Önkoşullar

- Azure CLI (Bicep'i `az bicep install` ile alır), .NET SDK (`global.json`), Node 22, `dotnet-ef` (`dotnet tool install --global dotnet-ef --version "10.0.14"`, repodaki EF Core paket sürümü).
- Betikler Windows PowerShell 5.1 ve PowerShell 7 (`pwsh`) ile çalışacak biçimde yazıldı; yerelde yalnızca 5.1 ile denendi. `deploy.yml` betikleri `pwsh` ile çağırır (Linux runner, denenmedi).
- Yerelde `pnpm` yoksa `publish-web.ps1`, `packageManager` sürümüyle `npx pnpm@<sürüm>` kullanır.

## Bölge notu

`location` varsayılanı `westeurope`. Öğrenci aboneliklerinde izin verilen bölgeler kısıtlı olabilir; dağıtım "RequestDisallowedByAzure" benzeri bir hata verirse izin verilen bir bölge seçin (`az account list-locations`). SQL ve App Service kotaları bölgeye göre değişir.

## Çalışma zamanı sürümleri (doğrulanmalı)

- API `apiRuntime` varsayılanı `DOTNETCORE|10.0`. App Service Linux'ta .NET 10 desteğinin seçilen bölgede olup olmadığı abonelik olmadan doğrulanamadı. Dağıtımdan önce: `az webapp list-runtimes --os-type linux`. Desteklenmiyorsa seçenekler: `main.parameters.json` içinde desteklenen değere geçmek (uyumsuzsa çalışmaz) veya kapsayıcıya geçmek.
- Web `webRuntime` varsayılanı `NODE|22-lts`.

## Mimari kararlar ve ayarlar

- Sırlar Key Vault'ta; iki web uygulamasının sistem yönetilen kimliğine `Key Vault Secrets User` verilir ve uygulama ayarları `@Microsoft.KeyVault(SecretUri=...)` referansıdır.
- SQL ve Storage bağlantı dizeleri dağıtım çıktısına konmaz: Bicep bunları doğrudan Key Vault'a yazar (`Sql-ConnectionString`, `Storage-ConnectionString`). Bu nedenle `set-secrets.ps1` bu ikisini yazmaz, yalnızca JWT, pepper, proxy anahtarı ve Gemini anahtarlarını yazar.
- SQL yönetici şifresi `deploy-infra.ps1` tarafından rastgele üretilir, dosyaya yazılmaz; yalnızca Key Vault'taki bağlantı dizesinde bulunur. Yeniden dağıtımda mevcut şifre oradan okunur (dağıtımı yapan kullanıcıya `Key Vault Secrets Officer` verilir). Şifre dağıtım sırasında yerel `az` işleminin komut satırı argümanında kısa süre görünür.
- Key Vault sır adları: `Jwt-Key`, `RecoveryCodes-Pepper`, `Bff-ProxyKey` (API ve web aynı sır), `Gemini-QuestionApiKey`, `Gemini-SolutionApiKey`, `Sql-ConnectionString`, `Storage-ConnectionString`.
- API ayarları: `ASPNETCORE_ENVIRONMENT=Production`, `HttpsRedirection__Enabled=false` (App Service HTTPS Only), `Scheduler__Enabled=true`, `Ai__Provider=Gemini`, `Cors__AllowedOrigins__0=<web adresi>`, `Jwt__Key`, `RecoveryCodes__Pepper`, `Bff__ProxyKey`, `Ai__Gemini__QuestionApiKey`, `Ai__Gemini__SolutionApiKey`, `ConnectionStrings__DefaultConnection`, `Storage__ConnectionString`.
- Web ayarları: `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `TRUST_PROXY=true`, `TRUSTED_PROXY_HOPS=1`, `SESSION_COOKIE_SECURE=true`, `APP_ORIGIN`, `API_BASE_URL`, `CSP_IMG_HOSTS` (blob uç noktası), `CSP_REPORT_ONLY=true`, `BFF_PROXY_KEY`. Başlatma komutu `node apps/web/server.js` (standalone çıktısı `apps/web/server.js` altında; `publish-web.ps1` bunu doğrular). App Service istemci IP'sini `X-Forwarded-For` sonuna ekler (`ip:port` biçiminde); BFF bunu `TRUSTED_PROXY_HOPS=1` ile okur ve API'ye `X-LGS-Client-IP` + proxy anahtarıyla iletir.
- API'de `ForwardedHeaders` kapalıdır; istemci IP'si yalnızca BFF başlığından gelir. API adresine doğrudan gelen istekler (BFF'siz) hız sınırında tek adres gibi görünür.
- SQL güvenlik duvarı: "Azure hizmetlerine izin ver" (0.0.0.0) kuralı vardır (VNet yok). Migration sırasında çalıştıranın IP'si için geçici kural açılıp `finally` ile silinir.
- `appsettings.Development.json` (geliştirme pepper'ı içerir) yayın paketine `publish-api.ps1` tarafından alınmaz (aşağıya bakın).
- `deployMonitoring=true` ise Log Analytics (günlük üst sınır `logDailyCapGb`) ve Application Insights kurulur; web uygulamasına Node otomatik izleme eklenir, API için yalnızca konsol/HTTP günlükleri Log Analytics'e gider (API'de Application Insights SDK yok).
- Web uygulamasının kendi adresi (`APP_ORIGIN`, CORS) `https://<ad>.azurewebsites.net` olarak varsayılır. Özel alan adı kullanılacaksa `APP_ORIGIN` ve `Cors__AllowedOrigins__0` elle güncellenmelidir.

## İlk kurulum sırası (yerel betikler)

Tek komutla rehberli akış: `./scripts/deploy/first-install.ps1 -ResourceGroup <ad>` (her adımda onay ister). Elle sıra:

1. `az login`, doğru aboneliği seçin (`az account set`).
2. Bütçe: `./scripts/deploy/deploy-budget.ps1` (isterseniz `-ContactEmails 'ad@ornek.com'`; e-posta dosyaya yazılmaz, aksi halde yalnızca abonelik sahiplerine gider).
3. Altyapı: `./scripts/deploy/deploy-infra.ps1 -ResourceGroup <ad>`. Betik her zaman önce `what-if` gösterir ve açık onay ister; onay verilmezse hiçbir şey değişmez.
4. Sırlar: `./scripts/deploy/set-secrets.ps1 -ResourceGroup <ad>`. Pepper bir kez belirlenir, varsa üzerine yazılmaz. Gemini anahtarları gizli istemle sorulur.
5. Paketler: `./scripts/deploy/publish-api.ps1` ve `./scripts/deploy/publish-web.ps1` (`artifacts/` altına zip üretir).
6. Veritabanı: `./scripts/deploy/migrate-db.ps1 -ResourceGroup <ad>`: migration paketi üretilir, geçici güvenlik duvarı kuralı açılır, migration uygulanır, `seed-reference-data --dry-run` gösterilir, onayla gerçek çalıştırılır, kural `finally` ile silinir.
7. İlk müdür: `./scripts/deploy/set-seed.ps1 -ResourceGroup <ad>` (`Seed__Enabled`, `Seed__AdminUserName`, `Seed__AdminPassword`).
8. Dağıtım: `./scripts/deploy/deploy-apps.ps1 -ResourceGroup <ad>` (önce API, sonra web; sağlık denetimi yapar).
9. Müdür ilk girişte şifresini değiştirir.
10. `./scripts/deploy/set-seed.ps1 -ResourceGroup <ad> -Remove` ile Seed değişkenlerini silin.

Gerekçe notu: migration paketi ve `dotnet LGSApp.Api.dll seed-reference-data` işlemleri yayın makinesinde çalışır. Migration paketi uygulamanın ana bilgisayarını kurmaz, `AppDbContextFactory` kullanır; bu yüzden Production'da da çalışır. Bağlantı `ConnectionStrings__DefaultConnection` ortam değişkeniyle (betik ve `deploy.yml` böyle yapar; sır komut satırında görünmez) ya da `--connection` ile verilir; Production'da ikisi de yoksa LocalDB'ye düşülmez. Yerelde Production ortamıyla her iki yolla da doğrulandı.

## Özel alan adı (netpesinde.com) - web uygulaması

Yalnızca web uygulaması taşınır; API `azurewebsites.net` adresinde kalır. Parametreler boşken (`webCustomDomains=[]`) davranış değişmez.

Cloudflare kayıtlarının tümü yalnızca DNS (gri bulut) olmalıdır. Neden: yönetilen sertifikanın verilmesi ve yenilenmesi Azure'un alan adını doğrudan çözebilmesine bağlıdır; ayrıca turuncu bulut istemci IP'sini gizler ve hız sınırlaması yanlış IP'yi görür.

1. Doğrulama kimliğini alın: `az webapp show -g <rg> -n <web> --query customDomainVerificationId -o tsv` (dağıtım çıktısı `webCustomDomainVerificationId` da verir). Gelen IP: `az webapp show -g <rg> -n <web> --query inboundIpAddress -o tsv`.
2. Cloudflare'de ön kayıtlar: TXT `asuid.netpesinde.com` ve TXT `asuid.www.netpesinde.com` = doğrulama kimliği.
3. Cloudflare'de yönlendirme kayıtları: A `@` -> web gelen IP; CNAME `www` -> `<web>.azurewebsites.net`. Sertifika verilmeden önce bu kayıtlar uygulamaya çözülmelidir (apex için A kaydı şarttır).
4. Aşama A (`bind`): `webCustomDomains=["netpesinde.com","www.netpesinde.com"]`, `webCustomDomainStage=bind` ile dağıtın. Alan adı bağlamaları SSL olmadan oluşur; APP_ORIGIN ve API CORS özel alan adlarını da içerir.
5. Aşama B (`certify`): A ve CNAME kayıtları gri bulutla oluşturulup uygulamaya çözülmeye başladıktan sonra `webCustomDomainStage=certify` ile dağıtın. Sıra: bağlamalar (SSL yok, kesinti olmaz), yönetilen sertifikalar, SNI SSL ile yeniden bağlama. Sertifika verilmesi birkaç dakika sürebilir. Bu aşama yalnızca ilk sertifika için kullanılır.
6. Aşama C (`secured`): `webCustomDomainStage=secured` ve `webCanonicalHost=netpesinde.com` ile kısa bir üçüncü dağıtım yapın. Bu aşamada mevcut sertifikalar okunur ve bağlamalar doğrudan SNI olarak yazılır (SSL düşmez). Sonraki tüm altyapı dağıtımları `secured` kalmalıdır. `webCanonicalHost` yalnızca `secured` aşamasında ve `webCustomDomains` içindeyse uygulanır; aksi halde yok sayılır ve `webCanonicalHostIgnored` çıktısı `true` olur. Uygulanınca web uygulaması `CANONICAL_HOST` ile diğer adresleri buna yönlendirir ve `webUrl` çıktısı bu adı gösterir. `deploy.yml` sağlık denetimi azurewebsites adresini (`webDefaultUrl`) kullanır, DNS/sertifikaya bağlı değildir.
7. Apex A kaydı uygulamanın gelen IP'sini gösterir. Plan yeniden oluşturulursa veya başka bir ölçek birimine taşınırsa bu IP değişebilir. Düzenli olarak `az webapp show -g <rg> -n <web> --query inboundIpAddress -o tsv` ile kontrol edin ve değiştiyse Cloudflare'deki A kaydını güncelleyin.

## GitHub Actions

- `ci.yml`: backend (build `-warnaserror`, test, OpenAPI farkı, güvenlik açığı denetimi), frontend (lint, typecheck, test, build, şema farkı, `pnpm audit --prod` yalnız uyarı), smoke (Linux Release publish + Production + Azurite), e2e (yalnız elle, taslak).
- SQL Server için "servis konteyneri" yerine `docker run` adımı kullanılır; çünkü servis konteyneri iş adımlarından önce başlar ve iş başında rastgele üretilen SA şifresi ona verilemez. Azurite de `--skipApiVersionCheck` bayrağı gerektiği için aynı şekilde `docker run` ile başlar.
- `deploy.yml`: `workflow_dispatch`, `environment: production` (manuel onay), `azure/login` ile OIDC. **Abonelik ve federated credential kurulunca etkinleşir.** Gerekenler:
  1. Entra uygulaması + hizmet sorumlusu oluşturun, federated credential ekleyin (konu: `repo:<sahip>/<depo>:environment:production`, hedef kitle `api://AzureADTokenExchange`).
  2. Hizmet sorumlusuna kaynak grubunda `Contributor` ve Key Vault'ta `Key Vault Secrets User` verin.
  3. GitHub `production` ortamında `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` sırlarını tanımlayın ve onaylayıcı ekleyin.
- Action sürümleri büyük sürüm etiketiyle (`@v4`, `@v2`) sabitlenmiştir; yayın öncesi güncel sürümleri doğrulayıp commit SHA'sına sabitlemeniz (Dependabot) önerilir.

## Doğrulama durumu

| Öğe | Durum |
| --- | --- |
| `publish-api.ps1` (Windows PowerShell 5.1) | Çalıştırıldı; zip `appsettings.Development.json` içermiyor, `libSkiaSharp.so` var |
| `publish-web.ps1` (5.1) | Çalıştırıldı; zip açılıp `node apps/web/server.js` ile PORT=3310'da başlatıldı, `/healthz` 200 |
| Zip içi yol ayırıcıları | Windows PowerShell 5.1'in `ZipFile.CreateFromDirectory` çıktısı ters eğik çizgi kullanıyordu; yazılan yardımcı `/` kullanıyor (doğrulandı) |
| Migration paketi (`dotnet ef migrations bundle`) | Yerelde üretildi ve LocalDB'ye uygulandı (16 migration) |
| `smoke.sh` | Yerelde (Windows, LocalDB + Azurite) çalıştırıldı ve geçti; LocalDB `ProductionGuards` tarafından reddedildiği için yalnızca bu yerel denemede `SMOKE_ENVIRONMENT=Development` kullanıldı. Production + gerçek SQL/Linux koşusu CI'da ilk kez yapılacak |
| `ci.yml`, `deploy.yml` | YAML sözdizimi doğrulandı; `actionlint` çalıştırılamadı; GitHub üzerinde hiç koşmadı |
| Bicep (`az bicep build`/lint) | `main.bicep` ve `budget.bicep` için `az bicep build` ve `az bicep lint` temiz (v0.49.2); gerçek dağıtım denenmedi |
| PowerShell 7 / Linux | Denenmedi (yalnızca yol ayırıcıları `/` olarak yazıldı) |
| e2e işi | Doğrulanmadı |
| `deploy-*.ps1`, `set-secrets.ps1`, `migrate-db.ps1` Azure adımları | Abonelik yok; yalnızca sözdizimi ayrıştırması yapıldı |

## Bilinen riskler

- Key Vault referansları yeni sırları en geç 24 saatte alır; sır yazdıktan sonra `set-secrets.ps1 -RestartApps` kullanın.
- İlk dağıtımda rol ataması yayılmadan `set-secrets.ps1` yazma hatası verebilir; betik yeniden dener.
- B1'de iki uygulama tek VM'i paylaşır (1,75 GB RAM); Next.js ve .NET birlikte sıkışırsa B2'ye geçin (`appServiceSku`).
- Yayın paketini Windows'ta derlemek `sharp` için yalnızca `win32` ikili dosyasını (`@img/sharp-win32-x64`) taşır; Linux sürümü yoktur (`images.unoptimized` olduğundan çalışma zamanında kullanılmaz). Üretim paketini mümkünse CI'da (Linux) üretin.
- Gemini API anahtarları canlı CFML sistemiyle ortaksa iki sistem aynı kotayı kullanır.
- Key Vault temizleme koruması (`enableKeyVaultPurgeProtection`) varsayılan olarak açıktır. Açıldıktan sonra kapatılamaz; pepper (şifre kurtarma kodlarının anahtarı) kaybını önlemek için bilerek açık bırakılmıştır. Silinen kasanın adı bekleme süresince yeniden kullanılamaz.
- Web uygulamalarında FTP ve SCM için temel kimlik doğrulama (kullanıcı adı/şifre) kapalıdır (`basicPublishingCredentialsPolicies`). `az webapp deploy` Entra kimliğiyle çalışmaya devam eder; betikler ve `deploy.yml` yayın profili veya temel kimlik doğrulama kullanmaz.

## Bilinen riskler ve yayın sonrası adımlar

- **SQL güvenlik duvarı ve yönetici hesabı:** "Azure hizmetlerine izin ver" kuralı açıktır ve uygulama SQL sunucu yöneticisi kimliğiyle bağlanır. Yayın sonrası plan: uygulama için managed identity + contained user (çalışma zamanında `db_datareader`/`db_datawriter`; `db_ddladmin` yalnızca migration için ayrı kimlikte), ardından sunucu yöneticisi şifresinin bağlantı dizesinden çıkarılması ve gerekirse kuralın daraltılması.
- **Key Vault yetki kapsamı:** web uygulamalarının kimliği kasa kapsamında `Key Vault Secrets User` rolündedir; her uygulama kasadaki tüm sırları okuyabilir. İleride sır kapsamlı rol ataması ya da ABAC koşulu ile kısıtlanmalıdır.
- **CSP rapor modunda başlar:** `cspReportOnly=true`. `/csp-report` günlükleri birkaç gün izlenmeli, meşru kaynaklar eklendikten sonra `cspReportOnly=false` ile altyapı yeniden dağıtılmalıdır. Kontrol listesi: [ ] yayından sonra 3-5 gün içinde CSP raporlarını incele ve `cspReportOnly=false` ile yeniden dağıt (tarih: ____).
- **GitHub `production` ortamı:** depo ayarlarında (Settings > Environments > production) onaylayıcı ve "yalnız `main` dalı" dağıtım kuralı MUTLAKA kurulmalıdır; kurulmazsa OIDC kimliği başka dallardan kullanılabilir. Bu ayar depo içinde kodla tanımlanamaz.
- **Sırlar komut satırında:** SQL yönetici şifresi dağıtım sırasında, `set-secrets.ps1` sırları `az keyvault secret set` çağrısında kısa süre yerel işlemin komut satırı argümanında görünür. Paylaşımlı olmayan bir makinede çalıştırın.
- **Depolama paylaşımlı anahtar erişimi:** `allowSharedKeyAccess` açık kalmalıdır; blob SAS adresleri hesap anahtarıyla imzalanır. Anahtar sızarsa depolama hesabı anahtarı döndürülmelidir (Key Vault'taki `Storage-ConnectionString` güncellenir).
