# Frontend Uygulama Planı (Oturum 6 — 2026-11-14)

Plan agent çıktısının özeti + kullanıcı kararları. Çelişirse "Kullanıcı kararları" geçerlidir.

## Teknoloji
- Next.js 16 App Router, `output: "standalone"`, React 19, TypeScript strict (`noUncheckedIndexedAccess`), Node 22 LTS.
- pnpm workspaces (`node-linker=hoisted`): `frontend/apps/web`, `frontend/packages/api` (`@lgs/api`, web + ileride Expo ortak), ileride `apps/mobile`.
- Tailwind v4, shadcn/ui (Radix), lucide-react, sonner. TanStack Query v5, openapi-fetch + openapi-typescript (yalnız tip). React Hook Form + Zod v4. KaTeX (`trust:false`, markdown yok). Vitest, Playwright (Chromium + WebKit iPhone 13), axe.
- PWA: yalnız manifest + ikon, service worker yok.
- Sözleşme `contracts/openapi.json` depoda; backend build'inde `Microsoft.Extensions.ApiDescription.Server` ile üretilir, `pnpm gen:api` tip üretir, CI'da diff kontrolü. Üretilen dosyalar (`generated/`) yorum yasağı denetiminin dışında.

## Auth
- httpOnly cookie + Next.js BFF proxy (`app/api/[...path]/route.ts`), aynı origin, web için CORS yok. Ekranlar CSR; sunucuda yalnız `proxy.ts` yönlendirmesi ve layout'ta rol okuma.
- BFF: login/change-password/refresh yanıtındaki token'ları gövdeden çıkarıp cookie'ye yazar; logout cookie siler; 401'de cookie silinir ve `/giris?neden=oturum`. Mutasyonlarda Origin/Sec-Fetch-Site kontrolü (CSRF). change-password yeni token döndüğü için cookie mutlaka yenilenir.
- İlk giriş şifre değiştirme kilidi, müdür kurtarma kodları (tek gösterim, "Kaydettim" onayı), `recoveryCodesMissing` zorunlu yönlendirmesi, şifremi unuttum (her durumda aynı mesaj), müdür kurtarma.
- Uzun metin alanları sessionStorage taslağı.

## Backend değişiklikleri
| # | İş | Ne zaman |
|---|---|---|
| B1 | Tüm action'lara `ProducesResponseType`/typed sonuç, 4xx ProblemDetails; build'de `contracts/openapi.json`; enum camelCase string, `byte[]` format byte, `DateOnly` format date | F0 |
| B2 | Güvenilir BFF IP: `X-LGS-Proxy-Key` (sabit zamanlı, `Bff:ProxyKey`) doğruysa `X-LGS-Client-IP` RemoteIp olur; yoksa yok sayılır. Next.js IP'yi en sağdaki XFF girdisinden alır (port atılır) | F0 |
| B6 | Dönen refresh token (kullanıcı kararı) | F0 |
| B3 | `GET /api/questions` havuz listesi (lessonId, topicId, source, answered, since, sayfalama; CanSeeDiscussion kuralları; moderatöre includeHidden/scheduled) | F3 öncesi |
| B4 | `GET /api/me/stats`; `GET /api/students`, `GET /api/students/{id}/stats` (OgretmenOrMudur) | me: F3, öğretmen: F6 öncesi |
| B5 | `GET /api/questions/needs-solution` (`cozumEsik*` ayarları) | F6 öncesi |
| B7 | İsteğe bağlı `GET /api/settings/public`; çözüm silme ucu | F3 |

## Klasör
`frontend/` altında `apps/web/src/{proxy.ts, app/(auth), app/(app), app/(app)/ogretmen, app/(app)/yonetim, app/api/[...path], components/ui, components, features, lib/image, lib/session}`, `e2e/`; `packages/api/src/{generated, client.ts, problem.ts, enums.ts, options.ts, time.ts, queries, upload/queue.ts}`.

## İstemci kuralları
- Hata: `detail ?? title`; 400 `errors` alanlara büyük/küçük harf duyarsız eşlenir; `errors[""]` genel form hatası; 409 çakışma bandı + yeniden çekme; 429/503 `Retry-After` geri sayımı.
- Tarih: `Z` UTC → `Europe/Istanbul`; `ImageView.expiresAt` `+00:00` olabilir; DateOnly metin olarak; "bugün" TR saatine göre.
- `rowVersion` base64 aynen geri. Görseller `unoptimized`, width/height, SAS 90 dk (staleTime ≤30 dk, onError'da bir kez yeniden çek).
- Mobil öncelikli: `max-w-screen-md`, kart ızgarası, alt sekme (safe-area), input ≥16px, dokunma ≥44px.
- Bildirim sayacı 60 sn polling (sekme görünürken).
- AI paneli `aiSolutionState`'e göre; bilinmeyen değer `none`. `aiSuggestedOption` yalnız `isAnswerDisputed` true ve moderatöre.
- Yükleme: `DataTransfer` yok; createImageBitmap, başarısızsa tembel `heic-to`; canvas ≤2000 px JPEG 0.85, sırayla; XHR ile ≤3 eşzamanlı; `clientUploadId` bir kez üretilir; ağ/5xx/429/503'te 1/3/9 sn (Retry-After öncelikli); 400/413 tekrar yok.

## Ekranlar
- Ortak: giriş akışları, soru detayı (cevaplama, çözümler, beğeni, şikayet, AI paneli), yorum ağacı + `/yorumlar/[id]`, liderlik, bildirimler, profil.
- Öğrenci: pano, soru çöz, soru yükle (çoklu), sorularım, ödevler + ödev detayı, profil istatistikleri.
- Öğretmen: pano, ödev yönetimi + sonuçlar, havuza soru ekle (ileri tarihli), şikayetler, şüpheli anahtarlar, moderasyon araçları, konu planı, öğrenciler, çözüm bekleyenler.
- Müdür: kullanıcılar (oluştur, ban, şifre yenile, branş), şifre talepleri, zamanlayıcı, ders programı, yapay zekâ (durum + kullanım), ayarlar + dosya temizliği, kurtarma kodları.

## Aşamalar (her aşama sonunda reviewer-agent: lint/typecheck/test, Playwright Chromium + WebKit iPhone, 375/768/1280 görüntü + axe, yorum taraması)
- F0 Hazırlık: frontend-agent'a Write (yapıldı), B1, B2, B6, Azurite betiği.
- F1 İskelet + auth + tasarım sistemi.
- F2 Müdür: kullanıcılar ve şifre talepleri.
- F3 Öğrenci çekirdeği (önce B3, B4-me, B7).
- F4 Yükleme hattı.
- F5 AI ekranları (Fake AI ayarlarıyla).
- F6 Öğretmen (önce B4-öğretmen, B5).
- F7 Müdür operasyon.
- F8 Sertleştirme + yayın (CSP, başlıklar, GitHub Actions, App Service ayarları).

## Yerelde çalıştırma
- Azurite root devDependency (`pnpm azurite`, `.azurite/` gitignore). Yoksa yükleme testleri `test.skip`.
- Backend ayrı geliştirme DB'si (`LGSApp_Dev`, oluşturma kullanıcı onayıyla), `http://localhost:5299`, Fake AI. E2E ayrı DB `LGSApp_E2E` ve port.
- Web `.env.local`: `API_BASE_URL`, `BFF_PROXY_KEY`, `SESSION_COOKIE_SECURE=false`; `pnpm dev` → `http://localhost:3000`.

## Kullanıcı kararları (2026-11-14)
1. **Oturum:** dönen refresh token. Öğrenci/öğretmen 30 gün, müdür 12 saat; hash'li tablo; security stamp değişince (şifre, ban, rol) iptal; web'de httpOnly cookie, mobilde aynı uç.
2. **Eksik uçlar ihtiyaç anında:** B3 + B4-me F3'ten önce, B4-öğretmen + B5 F6'dan önce. Frontend sahte veri kullanmaz.
3. **Görsel kimlik tamamen yeni** (canlının renk/fontları korunmayacak). Tasarım sistemi F1'de önerilip kullanıcıya gösterilecek.
4. **frontend-agent'a Write eklendi.**
5. Alan adı (netpesinde.com / api.) F8'e ertelendi.
