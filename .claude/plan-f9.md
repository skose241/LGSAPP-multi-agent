# F9 Planı — Sayfadaki Soruları Ayırma ve PDF'ten Hızlı Soru Yükleme (2026-11-24)

Kaynak tasarım: `tasarim-domain.md` "PDF'ten ödev sorusu" (Revizyon 3). Plan agent tarafından mevcut koda göre çıkarıldı.

## 0. Kodda doğrulananlar
- Ayırıcı ayrı ekran olmaz; kırpılan görseller `features/upload/photo-question-composer.tsx`'e beslenir (yükleme kuyruğu, şık/konu, kart başına gönderim, 429 bekleme, `uncertain`, unmount dosya silme hazır).
- Ödev (`assignment-add-panels.tsx` `PhotoPanel.submitCard/reconcileCard`) ve havuz (`pool-add-page.tsx` `submitCard`) yolları aynen kullanılır. F9a/F9b'de backend değişikliği yok.
- Kart sınırı: ödev `ASSIGNMENT_BATCH_MAX=20`, havuz `MAX_CARDS=20` → 20'lik partiler.
- Hız: soru oluşturma 10/dk, dosya 30/dk; 20 kartlık havuz partisi ≈70 sn.
- `prepare.ts` ve sunucu kısa kenar <200 px reddeder → kırpımlar yüksek çözünürlükte render edilir.
- CSP (`lib/csp.ts`) zaten `worker-src 'self' blob:`, `'wasm-unsafe-eval'`, `'strict-dynamic'`, `font-src 'self' data:`; pdf.js için değişiklik yok, `isEvalSupported:false` şart.
- `AiQuotaService` operasyon parametreli DEĞİL (Solution sabit, `questionId` zorunlu) → F9c'de refactor.
- `AiLog` `QuestionId`/`ImageFileId` nullable, `QuestionDetection=6` var; yeni kolon yok.
- Ayarlar `HasData(SettingKeys.Defaults)` → F9c yeni ayar = yalnız `InsertData` içeren veri migration'ı.
- BFF gövde sınırı 12 MB; `publish-web.ps1` `public/` kopyalar; Vitest ortamı `node`.

## F9a — Yalnız frontend, AI'sız elle çerçeveleme
Agent: frontend-agent → reviewer-agent. Backend/şema/altyapı değişikliği yok, F8e ile paralel olabilir. Büyüklük: ~1800–2400 satır kod + 600–900 test, iki tur (motor+kanvas, entegrasyon+E2E).

### Kütüphane
- `pdfjs-dist` 5.x (Apache-2.0), kesin sürüme sabit; `pdfjs-dist/legacy/build/pdf.min.mjs`. Lisans sayfası kendiliğinden; `licenses.spec.ts` sayısı kontrol edilmeli.
- Kırpma UI kendi SVG + Pointer Events (react-image-crop tek çerçeve, react-konva ağır).

### pdf.js yükleme / CSP / bundle
- `lib/pdf/pdfjs.ts` içinde yalnız PDF seçilince `await import()`.
- `scripts/copy-pdfjs-assets.mjs` → `public/pdfjs/<sürüm>/` (worker, cmaps, standard_fonts, wasm); `predev`/`prebuild`; `public/pdfjs` `.gitignore`.
- `GlobalWorkerOptions.workerSrc`, `cMapUrl`, `standardFontDataUrl`, `wasmUrl`, `isEvalSupported:false`, `enableXfa:false`.
- `next.config.ts`: `/pdfjs/:path*` `Cache-Control: public, max-age=31536000, immutable`; gerekirse `turbopack.resolveAlias` (canvas).
- E2E: PDF seçilmeden `/pdfjs` isteği yok; PDF senaryosunda CSP raporu yok.

### Yeni dosyalar (`frontend/apps/web/src/`)
- `lib/page-split/geometry.ts` (+test): normalize rect 0..1; fromDrag, clamp, move, resize, minSize, hitTest, overlap, merge, toPixels(rotation), sortReadingOrder (sütun farkındalıklı).
- `lib/page-split/crop-plan.ts` (+test): uzun kenar 2000, kısa kenar ≥200, kanvas ≤16 MP.
- `lib/page-split/answer-key.ts` (+test): "1A 2C", "1-a, 2-b", "ACBD…".
- `lib/page-split/draft-store.ts` (+test): sessionStorage, PDF `fingerprints[0]` / fotoğraf ad+boyut+lastModified, sürümlü, boyut sınırlı.
- `lib/page-split/sources.ts`: `PageSource` (kind, pageCount, pageSize, renderPage, renderCrop, dispose).
- `lib/pdf/pdfjs.ts`, `lib/pdf/pdf-source.ts`: kırpım boyutunda kanvas + transform; RenderTask.cancel; PasswordException/InvalidPDFException eşlemesi.
- `lib/page-split/image-source.ts`: `browserImageDeps` ile (HEIC dahil), drawImage kırpma, 90° döndürme.
- `features/page-split/page-splitter.tsx`, `page-canvas.tsx` (SVG çerçeve, 8 tutamaç, A–D hızlı seçim, Çiz/Kaydır kipi, zoom, klavye, geri al), `page-strip.tsx`, `box-list.tsx`, `use-page-source.ts`, `answer-key-dialog.tsx`.

### Değişecek dosyalar
- `photo-question-composer.tsx`: `ref` → `ComposerHandle { addFiles(entries), slots() }`; `ComposerIncoming { file, option?, topicId?, label?, sourceKey? }`; kartta `label`/`sourceKey`; `onCardsChange`. Öğrenci davranışı değişmemeli.
- `assignment-add-panels.tsx`: 4. panel "Sayfadan Ayır" (ScanLine); submit/reconcile `useAssignmentCardSubmit(detail)` hook'una taşınır; tembel bağlama.
- `pool-add-page.tsx`: "Fotoğraflar | Sayfadan Ayır" seçimi.
- `apps/web/package.json`, `next.config.ts`, `.gitignore`.

### Aktarma / yarıda kalma
- "Kartlara Aktar" boş slot kadar çerçeveyi okuma sırasıyla kırpar; kalanlar "Sırada"; "Sonraki N'yi Aktar".
- Kırpım JPEG q0.95, ad `sayfa-03-soru-05.jpg`.
- Hata/yeniden deneme mevcut kuyruk; aktarılmamış çerçevede `useBeforeUnload`; yenilemede taslak geri gelir (dosya yeniden seçilir).
- Sınırlar (öneri): PDF ≤50 MB / 60 sayfa, ≤20 fotoğraf, çerçeve kenarı ≥%3.

### Testler
- Vitest: geometry, crop-plan, answer-key, draft-store, pdf hata eşlemesi, composer yardımcıları; node'da pdf.js ile fixture PDF.
- E2E `e2e/teacher-page-split.spec.ts` (+ `e2e/support/pdf-fixture.ts`, çalışma anında üretim): çiz/taşı/boyutlandır/sil, cevap anahtarı, ödeve aktar, havuzda planlı yayın, 25 çerçeve parti, fotoğraf kaynağı, dokunmatik, bozuk PDF, `/api/files` 500 → Tekrar Dene, yenile+taslak, `/pdfjs` tembel, CSP, axe. Windows'ta `-g` ile Türkçe karakter yok.
- reviewer: tam vitest/E2E + 40 sayfa PDF bellek kontrolü.

### Riskler
- iOS kanvas belleği (~384 MB) / 16 MP; Turbopack + pdf.js; dokunmatik kaydırma çakışması; composer değişikliğinin öğrenci akışına etkisi; gerçek iPhone "Dosya zorunludur" kök nedeni bilinmiyor → F8e cihaz testine bu akış eklenir.

## F9b — pdf.js metin katmanıyla otomatik öneri
Agent: frontend-agent → reviewer-agent. Backend yok. Orta (~600–900 satır).
- `lib/page-split/text-detect.ts` (+test): satır gruplama, numara regex `^(\d{1,3})\s*[.)\-–]` / "Soru 5" (A)–D) hariç), sütun kümeleme, numaradan numaraya bölge, üst/alt bilgi temizliği, dizi kontrolü → `{ boxes, confidence, issues }`.
- `lib/page-split/answer-key-detect.ts` (+test), `lib/page-split/trim.ts` (+test, "Kenarları Sıkılaştır"), `lib/pdf/text-content.ts`.
- UI: "Otomatik Bul (Bu Sayfa / Tüm Sayfalar)", kesikli öneri, "Önerileri Kabul Et", düşük güven rozeti, metinsiz PDF uyarısı.
- Testler: sentetik metin parçası fixture'ları (tek/iki sütun, ortak metin, üst/alt bilgi, eksik numara); E2E iki sütunlu fixture 8 öneri.

## F9c — Gemini ile tespit (`POST /api/ai/detect-questions`)
Agent: backend-agent → frontend-agent (`gen:api`) → reviewer-agent. F8e sonrası önerilir.
- Şema: kolon yok; veri migration'ı `AiQuestionDetectionSettings` (yalnız InsertData). Yeni sır yok (`Ai:Gemini:QuestionApiKey`); opsiyonel `Ai:Detection:Model`. `RateLimiting:AiDetect` (6/dk).
- İstek: multipart `file` (≤4 MB, uzun kenar 1600), `lessonId`, `mode` (`questions`|`answerKey`); `OgretmenOrMudur`, branş eşleşmesi yoksa 403.
- Yanıt: `questions[{number, box{x,y,width,height}, sharedStem, suggestedOption, confidence}]`, `isAnswerKeyPage`, `answerKey`, `quota`. Hatalar 400/403/413/422(iade)/429 ("...hakkınız doldu...")/503.
- `GET /api/ai/detect-questions/quota`. Kayıt oluşturmaz, görsel blob'a/AiLog'a yazılmaz.
- Backend yeni: `QuestionDetectionService`, `IQuestionDetector`, `GeminiQuestionDetector`, `FakeQuestionDetector` (2×2), `QuestionDetectionModels`; prompt/şema `box_2d` 0..1000 → 0..1, ≤30 kutu.
- Değişecek: `AiQuotaService` (`AiQuotaScope`), `AiController`, `RateLimitingExtensions/Options`, `SettingKeys` (`aiSoruTespitAktifMi=1`, `aiSoruTespitGunlukLimit=30`, `aiSoruTespitGlobalLimit=200`), `AdminSettingRules`, `AiServiceCollectionExtensions`, `AiOptions`, `AiAdminService` etiketi.
- Testler: kutu dönüşümü, şema, kota kapsam bağımsızlığı, branş, 503, blob yazılmaz, API entegrasyon, regresyon.
- Frontend: `packages/api/src/queries/ai.ts`, `lib/page-split/ai-detect.ts` (IoU birleştirme), "Yapay Zekâ ile Bul", "AI Önerisi: B, Kullan" çipi, answerKey modu, `classifyAiRequestFailure`; E2E `ai-teacher.spec.ts`.

## Sıra
F9a → F9b → F9c; her aşama sonunda reviewer + oturum notu.

## Kararlar
Kullanıcı (2026-11-24):
1. Yer: mevcut ekranlar — ödev detayında 4. panel "Sayfadan Ayır" + havuz "Fotoğraflar | Sayfadan Ayır". Ayrı sayfa yok.
2. Ortak metinli sorular: sonraya; F9a'da öğretmen ortak metni dahil ederek büyük çerçeve çizer.
3. Sınırlar: PDF ≤60 sayfa / 50 MB, 20'lik parti.
4. F9c: Gemini'ye gönderim kabul, düğmede telif/gizlilik bilgi notu; mevcut `QuestionApiKey`; öğretmen 30 / global 200 sayfa/gün.

Varsayılanla kapatılanlar: hızlı cevap anahtarı girişi var; yenilemede taslak geri gelir; formatlar PDF + JPG/PNG/HEIC/WebP (Word/PPT için "PDF olarak kaydedin" notu); metin tespiti düğmeyle; AI şıkkı yalnız öneri çipi (tümüne uygula yok); mobil uygulama F9 kapsamı dışında.
