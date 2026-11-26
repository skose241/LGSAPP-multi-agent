import fs from "node:fs";
import path from "node:path";
import { chromium, devices, webkit } from "@playwright/test";
import { call, login } from "./api.mjs";
import { heroStudent, heroTeacher, shotsDir, stateFile, studentPassword, students, teacherPassword, teachers } from "./config.mjs";
import { extraImages, worksheet } from "./content.mjs";
import { closeRenderer, m, renderNotebook, renderPdf, renderQuestionCard, renderWorksheetPdf } from "./render.mjs";

const webUrl = process.env.DEMO_WEB_URL ?? "http://localhost:3200";
const channel = process.env.DEMO_CHROMIUM_CHANNEL || "chrome";
const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").split("=")[1];
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
const ids = state.ids;
const failures = [];
const produced = [];

const student = students.find((s) => s.key === heroStudent);
const teacher = teachers.find((t) => t.key === heroTeacher);

const settleCss = `
*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important; }
[data-sonner-toaster] { display: none !important; }
`;

async function settle(page, extra = 400) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
  await page
    .waitForFunction(() => !document.querySelector('[role="status"][aria-label*="yükleniyor"], .animate-pulse'), null, { timeout: 15000 })
    .catch(() => undefined);
  await page
    .waitForFunction(() => Array.from(document.images).every((img) => img.complete && (img.naturalWidth > 0 || !img.src || img.loading === "lazy")), null, { timeout: 15000 })
    .catch(() => undefined);
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(extra);
}

async function lazyImages(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 700) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .waitForFunction(() => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 15000 })
    .catch(() => undefined);
}

function makeSaver(role, device) {
  const dir = path.join(shotsDir, role, device);
  fs.mkdirSync(dir, { recursive: true });
  let counter = 0;
  return async function save(page, name, { full = false, locator = null, scrollTo = null } = {}) {
    counter += 1;
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes("[Test]")) throw new Error(`Ekranda "[Test]" metni görünüyor (${name}).`);
    const file = path.join(dir, `${String(counter).padStart(2, "0")}-${name}.png`);
    if (full) await lazyImages(page);
    if (scrollTo) {
      await scrollTo.evaluate((element) => element.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -104));
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.waitForTimeout(250);
    if (locator) await locator.screenshot({ path: file });
    else await page.screenshot({ path: file, fullPage: full });
    produced.push(file);
    console.log(`[capture] ${path.relative(shotsDir, file)}`);
  };
}

async function step(label, fn) {
  if (only && !label.includes(only)) return;
  try {
    await fn();
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
    console.warn(`[capture] BAŞARISIZ ${label}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
  }
}

async function open(page, route) {
  await page.goto(`${webUrl}${route}`);
  await settle(page);
}

async function doLogin(page, userName, password) {
  await page.goto(`${webUrl}/giris`);
  await page.getByLabel("Kullanıcı Adı").fill(userName);
  await page.getByLabel(/^Şifre\*?$/).fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/giris"), { timeout: 30000 });
  await settle(page);
}

async function newContext(browserType, options, extra = {}) {
  const browser = await browserType.launch(browserType === chromium ? { channel } : {});
  const context = await browser.newContext({ ...options, locale: "tr-TR", timezoneId: "Europe/Istanbul", ...extra });
  await context.addInitScript(`document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(settleCss)}; document.head.appendChild(s); });`);
  return { browser, context };
}

const deviceSpecs = [
  { name: "desktop", type: chromium, options: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
  { name: "mobile", type: webkit, options: { ...devices["iPhone 13"] } },
];

async function studentShots(spec, upload) {
  const { browser, context } = await newContext(spec.type, spec.options);
  const page = await context.newPage();
  const save = makeSaver("student", spec.name);
  const mobile = spec.name === "mobile";

  await step(`student-${spec.name}-giris`, async () => {
    await open(page, "/giris");
    await save(page, "giris-ekrani");
  });
  await step(`student-${spec.name}-unuttum`, async () => {
    await open(page, "/sifremi-unuttum");
    await save(page, "sifremi-unuttum");
  });
  await step(`student-${spec.name}-login`, async () => {
    await doLogin(page, student.userName, studentPassword);
  });
  await step(`student-${spec.name}-pano`, async () => {
    await open(page, "/");
    await page.getByRole("heading", { name: /Merhaba/ }).waitFor();
    await save(page, "pano");
    if (mobile) {
      const hint = page.getByRole("region", { name: "Uygulamayı Ana Ekrana Ekle" });
      if (await hint.isVisible().catch(() => false)) await save(page, "ana-ekrana-ekle-ipucu", { locator: hint });
    }
  });
  await step(`student-${spec.name}-sorular`, async () => {
    await open(page, "/sorular");
    await page.getByRole("button", { name: "Tümü" }).click();
    await settle(page, 600);
    await save(page, "soru-coz-listesi", { full: mobile });
  });
  await step(`student-${spec.name}-detay-once`, async () => {
    await open(page, `/sorular/${ids.fen_asit}`);
    await save(page, "soru-detayi-cevap-oncesi", { full: true });
  });
  await step(`student-${spec.name}-detay-sonra`, async () => {
    await open(page, `/sorular/${ids.mat_esit}`);
    await save(page, "soru-detayi-cevap-sonrasi", { full: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await save(page, "soru-detayi-ust-ekran");
    if (!mobile) {
      await save(page, "cozumler-ust-ekran", { scrollTo: page.locator('section[aria-label="Çözümler"]') });
    }
    await save(page, "yorum-dizisi-ekran", { scrollTo: page.locator('section[aria-label="Soru yorumları"]').first() });
  });
  await step(`student-${spec.name}-yukle`, async () => {
    await open(page, "/soru-yukle");
    await page.getByTestId("photo-input").setInputFiles(upload.map((u, i) => ({ name: `soru-${i + 1}.jpg`, mimeType: u.mime, buffer: u.buffer })));
    await page.locator('[data-testid="upload-card"]').first().waitFor();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="upload-card"] [data-testid="upload-status"][data-status="done"]').length >= 2, null, { timeout: 60000 });
    const cards = page.locator('[data-testid="upload-card"]');
    const lessonNames = ["Matematik", "Matematik"];
    const descriptions = [
      "Yarısı 24 olan sayının üçte birini bulurken önce sayıyı buldum ama sonra üçe mi bölmem gerektiği yoksa üçle mi çarpmam gerektiği konusunda takıldım.",
      "Karesini alınca ortadaki çarpımı nasıl yok edeceğimi bulamadım. Eşitliğin iki tarafının karesini almak doğru yol mu, emin olamadım.",
    ];
    const options = ["B", "B"];
    for (let i = 0; i < 2; i += 1) {
      const card = cards.nth(i);
      await card.getByLabel(/^Ders\*?$/).selectOption({ label: lessonNames[i] });
      await card.getByRole("radio", { name: `${options[i]} şıkkı` }).click();
      await card.getByLabel(/^Nerede Takıldınız/).fill(descriptions[i]);
    }
    await settle(page, 600);
    await save(page, "soru-yukle-formu", { full: true });
    await save(page, "soru-yukle-formu-ust-ekran", { scrollTo: page.getByRole("heading", { name: /Yüklenecek Sorular/ }) });
  });
  await step(`student-${spec.name}-sorularim`, async () => {
    await open(page, "/sorularim");
    await save(page, "sorularim", { full: mobile });
  });
  await step(`student-${spec.name}-odevler`, async () => {
    await open(page, "/odevler");
    await save(page, "odevlerim", { full: mobile });
  });
  await step(`student-${spec.name}-odev-detay`, async () => {
    await open(page, `/odevler/${ids.openAssignment}`);
    await save(page, "odev-detayi", { full: true });
  });
  await step(`student-${spec.name}-bildirimler`, async () => {
    await open(page, "/bildirimler");
    await save(page, "bildirimler", { full: mobile });
  });
  await step(`student-${spec.name}-liderlik`, async () => {
    await open(page, "/liderlik");
    await save(page, "liderlik", { full: mobile });
    if (mobile) await save(page, "liderlik-ekran");
  });
  await step(`student-${spec.name}-profil`, async () => {
    await open(page, "/profil");
    await save(page, "profil-istatistikleri", { full: true });
    await save(page, "profil-istatistikleri-ekran");
  });

  await browser.close();
}

async function teacherShots(spec, assets) {
  const { browser, context } = await newContext(spec.type, spec.options);
  const page = await context.newPage();
  const save = makeSaver("teacher", spec.name);
  const mobile = spec.name === "mobile";

  await step(`teacher-${spec.name}-login`, async () => {
    await doLogin(page, teacher.userName, teacherPassword);
  });
  await step(`teacher-${spec.name}-pano`, async () => {
    await open(page, "/");
    await page.getByRole("heading", { name: /Merhaba/ }).waitFor();
    await save(page, "pano", { full: true });
  });
  await step(`teacher-${spec.name}-odevler`, async () => {
    await open(page, "/ogretmen/odevler");
    await save(page, "odev-yonetimi", { full: true });
  });
  await step(`teacher-${spec.name}-yeni-odev`, async () => {
    await open(page, "/ogretmen/odevler/yeni");
    const title = page.getByLabel(/^Başlık/);
    if (await title.count()) await title.first().fill("Üçgenler: Konu Pekiştirme");
    const description = page.getByLabel(/^Açıklama/);
    if (await description.count()) await description.first().fill("Pisagor bağıntısı ve üçgen eşitsizliğini içeren kısa bir tekrar ödevi.");
    await settle(page, 300);
    await save(page, "yeni-odev-formu", { full: true });
  });
  await step(`teacher-${spec.name}-odev-detay`, async () => {
    await open(page, `/ogretmen/odevler/${ids.openAssignment}`);
    await save(page, "odev-detayi-sorular", { full: true });
  });
  await step(`teacher-${spec.name}-odev-sonuc`, async () => {
    await open(page, `/ogretmen/odevler/${ids.openAssignment}/sonuclar`);
    await save(page, "odev-sonuclari", { full: true });
  });
  await step(`teacher-${spec.name}-odev-sonuc-kapali`, async () => {
    await open(page, `/ogretmen/odevler/${ids.closedAssignment}/sonuclar`);
    await save(page, "kapanan-odev-sonuclari", { full: true });
  });
  await step(`teacher-${spec.name}-havuz-foto`, async () => {
    await open(page, "/ogretmen/soru-ekle");
    await page.getByTestId("photo-input").first().setInputFiles(assets.cards.map((c, i) => ({ name: `soru-${i + 1}.png`, mimeType: c.mime, buffer: c.buffer })));
    await page.locator('[data-testid="composer-card"]').first().waitFor();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="composer-card"] [data-testid="upload-status"][data-status="done"]').length >= 2, null, { timeout: 60000 });
    const cards = page.locator('[data-testid="composer-card"]');
    for (let i = 0; i < 2; i += 1) {
      const card = cards.nth(i);
      await card.getByRole("radio", { name: new RegExp(`${assets.keys[i]} şıkkı`) }).click();
    }
    await settle(page, 600);
    await save(page, "havuza-soru-ekle-fotograflar", { full: true });
  });
  await step(`teacher-${spec.name}-sayfadan-ayir`, async () => {
    await open(page, "/ogretmen/soru-ekle");
    await page.getByRole("button", { name: "Sayfadan Ayır" }).click();
    await page.getByTestId("split-pdf-input").setInputFiles({ name: "deneme-sinavi.pdf", mimeType: "application/pdf", buffer: assets.pdf.buffer });
    await page.getByTestId("split-workspace").waitFor({ timeout: 60000 });
    await page.getByTestId("page-image").waitFor({ timeout: 60000 });
    await settle(page, 1200);
    if (!mobile) {
      const existing = await page.getByTestId("split-box").count();
      if (existing === 0) {
        const overlay = page.getByTestId("page-overlay");
        await overlay.scrollIntoViewIfNeeded();
        const box = await overlay.boundingBox();
        for (const frame of assets.pdf.frames[0]) {
          const inset = 0.01;
          const x = frame.x + inset;
          const y = frame.y + inset;
          const w = frame.width - inset * 2;
          const h = frame.height - inset * 2;
          await page.mouse.move(box.x + x * box.width, box.y + y * box.height);
          await page.mouse.down();
          await page.mouse.move(box.x + (x + w / 2) * box.width, box.y + (y + h / 2) * box.height, { steps: 4 });
          await page.mouse.move(box.x + (x + w) * box.width, box.y + (y + h) * box.height, { steps: 4 });
          await page.mouse.up();
        }
        await page.waitForTimeout(500);
      }
    }
    await save(page, "sayfadan-ayir-cerceveler", { full: true });
  });
  await step(`teacher-${spec.name}-konu-plani`, async () => {
    await open(page, "/ogretmen/konu-plani");
    await save(page, "konu-plani", { full: true });
  });
  await step(`teacher-${spec.name}-ogrenciler`, async () => {
    await open(page, "/ogretmen/ogrenciler");
    await save(page, "ogrenciler", { full: true });
  });
  await step(`teacher-${spec.name}-ogrenci-profili`, async () => {
    await open(page, `/ogretmen/ogrenciler/${state.users[heroStudent].id}`);
    await save(page, "ogrenci-profili", { full: true });
  });
  await step(`teacher-${spec.name}-sikayetler`, async () => {
    await open(page, "/ogretmen/sikayetler");
    await save(page, "sikayetler", { full: mobile });
  });
  await step(`teacher-${spec.name}-sikayet-detay`, async () => {
    const session = await login(teacher.userName, teacherPassword);
    const list = await call("GET", "/api/admin/reports?status=pending&pageSize=50", { token: session.token });
    const report = list.body.items.find((item) => item.questionId === ids.ogr_basinc) ?? list.body.items[0];
    await open(page, `/ogretmen/sikayetler/${report.id}`);
    await save(page, "sikayet-detayi", { full: true });
  });
  await step(`teacher-${spec.name}-cozum-bekleyen`, async () => {
    await open(page, "/ogretmen/cozum-bekleyenler");
    await save(page, "cozum-bekleyenler", { full: true });
  });
  await step(`teacher-${spec.name}-soru-cozumlu`, async () => {
    await open(page, `/sorular/${ids.mat_esit}`);
    await save(page, "soru-detayi-ogretmen-cozumu", { full: true });
    await save(page, "cozumler-ust-ekran", { scrollTo: page.locator('section[aria-label="Çözümler"]') });
  });
  await step(`teacher-${spec.name}-liderlik`, async () => {
    await open(page, "/liderlik");
    await save(page, "liderlik", { full: mobile });
  });

  await browser.close();
}

async function prepareAssets() {
  const upload = [
    await renderNotebook({ name: "yukle_a", stem: extraImages.uploadA.stem, options: extraImages.uploadA.options }),
    await renderNotebook({ name: "yukle_b", stem: extraImages.uploadB.stem, options: extraImages.uploadB.options }),
  ];
  const keys = ["A", "B"];
  const cards = [
    await renderQuestionCard({
      name: "havuz_a",
      number: 1,
      lesson: "Matematik",
      stem: `<p>${m("\\sqrt{75}-\\sqrt{27}")} işleminin sonucu kaçtır?</p>`,
      options: [m("2\\sqrt{3}"), m("3\\sqrt{3}"), m("4\\sqrt{3}"), m("\\sqrt{48}")],
    }),
    await renderQuestionCard({
      name: "havuz_b",
      number: 2,
      lesson: "Matematik",
      stem: `<p>${m("3x+2y=16")} ve ${m("x-y=2")} denklem sisteminde x kaçtır?</p>`,
      options: ["3", "4", "5", "6"],
    }),
  ];
  const sheet = renderWorksheetPdf({ name: "deneme_sayfa", items: worksheet.items, title: worksheet.title });
  const pdf = await renderPdf(sheet);
  return { upload, assets: { cards, keys, pdf } };
}

async function main() {
  const { upload, assets } = await prepareAssets();
  await closeRenderer();
  for (const spec of deviceSpecs) {
    await studentShots(spec, upload);
    await teacherShots(spec, assets);
  }
  console.log(`[capture] ${produced.length} dosya üretildi`);
  if (failures.length) {
    console.error(`[capture] ${failures.length} adım başarısız:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
}

if (!only && fs.existsSync(shotsDir)) {
  for (const entry of fs.readdirSync(shotsDir)) fs.rmSync(path.join(shotsDir, entry), { recursive: true, force: true });
}
await main();
