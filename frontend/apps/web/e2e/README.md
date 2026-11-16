# E2E testleri

Tek komutla temiz ortamda tam koşu (Windows, macOS, Linux):

```
cd frontend/apps/web
npx pnpm@10 e2e:run
```

Playwright argümanları aynen iletilir, örneğin `npx pnpm@10 e2e:run e2e/licenses.spec.ts --project=chromium`.

## Betiğin yaptıkları (`e2e/run-e2e.mjs`)

1. 5390 (API) ve 10000-10002 (Azurite) portlarının boş olduğunu denetler. 3000 portuna dokunmaz.
2. LocalDB `LGSApp_E2E` veritabanını `dotnet ef database drop --force` ile siler, `dotnet ef database update` ile yeniden kurar. Bağlantı dizesi `LGSApp_E2E` içermiyorsa durur.
3. `.next-e2e` klasörünü siler.
4. Azurite'ı `npx -y azurite --skipApiVersionCheck` ile `.e2e/azurite` altında başlatır.
5. Backend'i şu ortamla başlatır:
   - `ASPNETCORE_ENVIRONMENT=Development`, `ASPNETCORE_URLS=http://localhost:5390`
   - `Ai__Provider=Fake`, `Ai__Fake__MismatchEveryNth=4` (uyuşmazlık testleri buna dayanır)
   - `Scheduler__Enabled=false`
   - `Seed__AdminUserName`, `Seed__AdminPassword`, `Bff__ProxyKey` (yalnız E2E'ye özel sabit test değerleri)
   - `ConnectionStrings__DefaultConnection` (LocalDB `LGSApp_E2E`)
6. Playwright'ı `E2E_CHROMIUM_CHANNEL=chrome` (sistem Chrome) ile Chromium ve WebKit iPhone projelerinde çalıştırır.
7. Bitince (hata olsa da) backend ve Azurite süreç ağaçlarını kapatır.

`global-setup.ts` backend'in `/api/admin/ai/status` yanıtında sağlayıcının `fake` olduğunu doğrular; değilse çalışma anlaşılır bir hatayla durur, gerçek Gemini'ye hiç gidilmez.

## Ortam değişkenleri (isteğe bağlı)

`E2E_API_PORT`, `E2E_PROXY_KEY`, `E2E_ADMIN_USER`, `E2E_ADMIN_PASSWORD`, `E2E_CONNECTION_STRING`, `E2E_CHROMIUM_CHANNEL`, `E2E_PORT` (web, varsayılan 3100), `E2E_PROJECT`. Gerçek anahtar veya şifre yazmayın.

## Gereksinimler

.NET SDK ve `dotnet-ef` aracı, LocalDB, Node 22, sistem Chrome, Playwright WebKit tarayıcısı (`npx playwright install webkit`).

## Notlar

- Aynı veritabanında art arda koşu müdür girişi testlerini bozabilir; betik her koşuda veritabanını sıfırladığı için sorun olmaz.
- AI kota testi `ai-solution` 3/dk sınırını beklediği için yaklaşık 1,5 dk sürer.
