import type { Page } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { backend } from "./support/backend";
import { expect, login, test } from "./support/fixtures";
import { expectClearOfTabBar } from "./support/layout";
import { startRun, waitRun } from "./support/scheduler-data";
import { activeUser, type ActiveUser } from "./support/student-data";

const ROUTE = "/yonetim/zamanlayici";

async function mockStart(page: Page, status: number, body: unknown, headers: Record<string, string> = {}) {
  await page.route(
    (url) => url.pathname === "/api/admin/scheduler/runs",
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({ status, headers, contentType: "application/problem+json", body: JSON.stringify(body) });
    },
  );
}

async function openAsMudur(page: Page, mudur: ActiveUser) {
  await login(page, mudur.userName, mudur.password);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
  await page.goto(ROUTE);
  await expect(page.getByRole("heading", { name: "Zamanlayıcı", level: 1 })).toBeVisible();
  await expect(page.getByTestId("job-card")).toHaveCount(4);
}

function card(page: Page, kind: string) {
  return page.locator(`[data-testid="job-card"][data-kind="${kind}"]`);
}

async function runNow(page: Page, kind: string) {
  await card(page, kind).getByTestId("run-now").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe.configure({ mode: "serial" });

test.describe("zamanlayıcı", () => {
  let mudur: ActiveUser;
  let assignmentsRunId = 0;

  test.beforeAll(async () => {
    mudur = await activeUser("mudur", "zaman");
  });

  test("durum ekranı bantları, dört iş kartı ve ders tablosu", async ({ page }) => {
    await openAsMudur(page, mudur);
    await expect(page.getByTestId("band-timer")).toContainText("Otomatik zamanlayıcı kapalı; görevler yalnız elle çalışır.");
    await expect(page.getByTestId("band-fake")).toBeVisible();
    for (const name of ["Soru üretimi", "Soru tamamlama", "Soru yayınlama", "Ödev kapatma"]) {
      await expect(page.getByRole("heading", { name, level: 3 })).toBeVisible();
    }
    await expect(card(page, "generate")).toContainText("17:30");
    await expect(page.getByRole("heading", { name: "Bugünkü ders tablosu", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Çalıştırma geçmişi", level: 2 })).toBeVisible();
  });

  test("onay pencereleri doğru uyarıyı gösterir", async ({ page }) => {
    await openAsMudur(page, mudur);
    let dialog = await runNow(page, "generate");
    await expect(dialog).toContainText("Gemini kotası");
    await dialog.getByRole("button", { name: "Vazgeç" }).click();
    await expect(dialog).toHaveCount(0);
    dialog = await runNow(page, "complete");
    await expect(dialog).toContainText("Gemini kotası");
    await dialog.getByRole("button", { name: "Vazgeç" }).click();
    await expect(dialog).toHaveCount(0);
    dialog = await runNow(page, "publish");
    await expect(dialog).toContainText("Bugünün planlı soruları");
    await dialog.getByRole("button", { name: "Vazgeç" }).click();
    await expect(page).toHaveURL(/\/yonetim\/zamanlayici$/);
  });

  test("375/768/1280 genişlikte taşma yok, axe temiz, alt menü çakışmaz", async ({ page }, testInfo) => {
    await openAsMudur(page, mudur);
    const sizes: (number | null)[] = testInfo.project.name === "webkit-iphone" ? [null] : [375, 768, 1280];
    for (const size of sizes) {
      if (size !== null) await page.setViewportSize({ width: size, height: 900 });
      await page.goto(ROUTE);
      await expect(page.getByTestId("job-card")).toHaveCount(4);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `taşma ${size ?? "iphone"}`).toBeLessThanOrEqual(0);
      await expectNoAxeViolations(page, `zamanlayici ${size ?? "iphone"}`);
      await expectClearOfTabBar(page, `zamanlayici-${size ?? "iphone"}`, testInfo.project.name);
    }
  });

  test("ödev kapatma gerçek tetik detay sayfasında biter", async ({ page }) => {
    await openAsMudur(page, mudur);
    const dialog = await runNow(page, "assignments");
    await expect(dialog).toContainText("Ödevler şimdi kapatılsın mı?");
    await dialog.getByRole("button", { name: "Şimdi kapat" }).click();
    await expect(page).toHaveURL(/\/yonetim\/zamanlayici\/\d+$/);
    assignmentsRunId = Number(page.url().match(/(\d+)$/)![1]);
    await expect(page.getByRole("heading", { name: "Ödev kapatma", level: 1 })).toBeVisible();
    const finished = await waitRun(mudur.token, assignmentsRunId);
    expect(finished.status).not.toBe("running");
    await expect(page.getByTestId("run-status")).toContainText(/Başarılı|Kısmen başarılı|Başarısız|Yarıda kesildi/);
    await expect(page.getByTestId("run-status")).not.toContainText("Çalışıyor");
    await expect(page.getByTestId("run-summary")).toBeVisible();
    await expectNoAxeViolations(page, "zamanlayici-detay");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("detay sayfası mobilde taşmaz ve olmayan numara bulunamadı gösterir", async ({ page }, testInfo) => {
    await openAsMudur(page, mudur);
    if (testInfo.project.name !== "webkit-iphone") await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${ROUTE}/${assignmentsRunId}`);
    await expect(page.getByRole("heading", { name: "Ödev kapatma", level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.goto(`${ROUTE}/99999999`);
    await expect(page.getByText("Çalıştırma bulunamadı")).toBeVisible();
  });

  test("çalışan görev 409 ve runId ile bağlantı gösterir", async ({ page }) => {
    await openAsMudur(page, mudur);
    await mockStart(page, 409, { title: "İşlem çakışması oluştu.", status: 409, detail: "Görev zaten çalışıyor.", runId: 987654 });
    const dialog = await runNow(page, "generate");
    await dialog.getByRole("button", { name: "Şimdi çalıştır" }).click();
    const banner = page.getByTestId("run-conflict");
    await expect(banner).toContainText("Bu görev şu anda çalışıyor.");
    await expect(banner.getByRole("link", { name: "Çalıştırmayı gör" })).toHaveAttribute("href", "/yonetim/zamanlayici/987654");
    await expect(page).toHaveURL(/\/yonetim\/zamanlayici$/);
  });

  test("429 yanıtı geri sayım gösterir ve tetikleri kilitler", async ({ page }) => {
    await openAsMudur(page, mudur);
    await mockStart(page, 429, { title: "Çok fazla istek", status: 429 }, { "retry-after": "30" });
    const dialog = await runNow(page, "publish");
    await dialog.getByRole("button", { name: "Şimdi yayınla" }).click();
    await expect(page.getByTestId("problem-banner")).toContainText("saniye sonra");
    for (const button of await page.getByTestId("run-now").all()) await expect(button).toBeDisabled();
  });

  test("runId olmayan 409 sunucu mesajını gösterir", async ({ page }) => {
    await openAsMudur(page, mudur);
    await mockStart(page, 409, { title: "İşlem çakışması oluştu.", status: 409, detail: "Soru üretimi ayarlardan kapatılmış." });
    const dialog = await runNow(page, "generate");
    await dialog.getByRole("button", { name: "Şimdi çalıştır" }).click();
    await expect(page.getByTestId("problem-banner")).toContainText("Soru üretimi ayarlardan kapatılmış.");
    await expect(page.getByTestId("run-conflict")).toHaveCount(0);
  });

  test("403 yanıtı ayrı mesaj gösterir", async ({ page }) => {
    await openAsMudur(page, mudur);
    await mockStart(page, 403, { title: "Yetkisiz", status: 403 });
    const dialog = await runNow(page, "assignments");
    await dialog.getByRole("button", { name: "Şimdi kapat" }).click();
    await expect(page.getByTestId("run-forbidden")).toBeVisible();
    await expect(page.getByTestId("problem-banner")).toHaveCount(0);
  });

  test("geçmiş filtresi adrese yazılır ve yenilemede korunur", async ({ page }) => {
    await openAsMudur(page, mudur);
    await expect(page.getByTestId("run-item").first()).toBeVisible();
    await page.getByLabel("Görev", { exact: true }).selectOption("assignments");
    await expect(page).toHaveURL(/tur=assignments/);
    await page.getByLabel("Durum", { exact: true }).selectOption("succeeded");
    await expect(page).toHaveURL(/durum=succeeded/);
    await page.getByLabel("Başlangıç tarihi").fill("2020-01-01");
    await expect(page).toHaveURL(/baslangic=2020-01-01/);
    await page.reload();
    await expect(page.getByLabel("Görev", { exact: true })).toHaveValue("assignments");
    await expect(page.getByLabel("Durum", { exact: true })).toHaveValue("succeeded");
    await expect(page.getByLabel("Başlangıç tarihi")).toHaveValue("2020-01-01");
    await page.getByRole("button", { name: "Filtreleri temizle" }).click();
    await expect(page).toHaveURL(/\/yonetim\/zamanlayici$/);
  });

  test("öğretmen ve öğrenci erişemez", async ({ page }) => {
    const teacher = await activeUser("ogretmen", "zamanht");
    const student = await activeUser("ogrenci", "zamanog");
    for (const user of [teacher, student]) {
      expect((await backend("GET", "/api/admin/scheduler/status", { token: user.token })).status).toBe(403);
      expect((await backend("GET", "/api/admin/scheduler/runs", { token: user.token })).status).toBe(403);
      expect((await startRun(user.token, "assignments")).status).toBe(403);
    }
    await login(page, teacher.userName, teacher.password);
    await page.goto(ROUTE);
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole("heading", { name: "Zamanlayıcı", level: 1 })).toHaveCount(0);
    await page.context().clearCookies();
    await login(page, student.userName, student.password);
    await page.goto(`${ROUTE}/1`);
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });

  test("müdür panosu zamanlayıcı özetini gösterir", async ({ page }) => {
    await login(page, mudur.userName, mudur.password);
    const summary = page.getByTestId("dashboard-scheduler");
    await expect(summary).toContainText("Kapalı");
    await expect(summary).toContainText("Ödev kapatma");
    await page.getByRole("link", { name: "Zamanlayıcıya git" }).click();
    await expect(page).toHaveURL(/\/yonetim\/zamanlayici$/);
  });
});
