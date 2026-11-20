import type { Page } from "@playwright/test";
import { readSettings, setSettings } from "./support/ai";
import { expectNoAxeViolations } from "./support/axe";
import { backend } from "./support/backend";
import { expect, login, test } from "./support/fixtures";
import { activeUser, type ActiveUser } from "./support/student-data";
import { freshQuestion } from "./support/world";

const ROUTE = "/yonetim/ayarlar";
const TOUCHED = ["sikayetMinKarakter", "puanDogruCevap", "yorumGorunurDerinlik", "yorumMaxDerinlik", "aciklamaMinKarakter", "cozumMaxKarakter"];

async function openAsMudur(page: Page, mudur: ActiveUser) {
  await login(page, mudur.userName, mudur.password);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
  await page.goto(ROUTE);
  await expect(page.getByRole("heading", { name: "Ayarlar", level: 1 })).toBeVisible();
  await expect(page.getByTestId("setting-sikayetMinKarakter")).toBeVisible();
}

async function report(student: ActiveUser, questionId: number, description: string) {
  return backend("POST", `/api/questions/${questionId}/reports`, {
    token: student.token,
    body: { reason: "incomplete", description },
  });
}

test.describe.configure({ mode: "serial" });

test.describe("genel ayarlar ve bakım", () => {
  let mudur: ActiveUser;
  let original: Record<string, number> = {};

  test.beforeAll(async () => {
    mudur = await activeUser("mudur", "ayar");
    const all = await readSettings();
    original = Object.fromEntries(TOUCHED.map((key) => [key, all[key]!]));
  });

  test.afterAll(async () => {
    await setSettings(original);
  });

  test("gruplu kartlar, varsayılan ve aralık, kritik not görünür", async ({ page }) => {
    await openAsMudur(page, mudur);
    for (const title of ["Puanlar", "Günlük Limitler", "Yorum ve Çözüm", "Şikâyet", "Çözüm Bekleyenler Eşikleri"]) {
      await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Bakım", level: 2 })).toBeVisible();
    await expect(page.getByText("(0 - 200, varsayılan 10)")).toBeVisible();
    for (const key of ["yorumMaxDerinlik", "yorumGorunurDerinlik", "cozumEsikCevapSayisi", "cozumEsikYanlisOrani"]) {
      await expect(page.getByTestId(`caution-${key}`)).toContainText("Dikkat:");
    }
    await expect(page.getByTestId("caution-sikayetMinKarakter")).toHaveCount(0);
    await expect(page.getByTestId("setting-aiCozumAktifMi")).toHaveCount(0);
    await expect(page.getByTestId("settings-save")).toBeDisabled();
  });

  test("ayar değişikliği öğrenci tarafında etkili olur ve yalnız değişen gönderilir", async ({ page }) => {
    const student = await activeUser("ogrenci", "ayarogr");
    const first = await freshQuestion();
    const second = await freshQuestion();
    const shortText = "Eksik Soru";
    expect((await report(student, first.question.id, shortText)).status).toBe(201);

    await openAsMudur(page, mudur);
    const writes: string[] = [];
    await page.route("**/api/admin/settings", async (route) => {
      if (route.request().method() === "PUT") writes.push(route.request().postData() ?? "");
      await route.fallback();
    });
    await page.getByTestId("setting-sikayetMinKarakter").fill("60");
    await expect(page.getByRole("status").filter({ hasText: "1 ayar değişti." })).toBeVisible();
    await page.getByTestId("settings-save").click();
    await expect(page.getByText("Ayarlar kaydedildi.").first()).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!)).toEqual({ sikayetMinKarakter: 60 });
    expect((await readSettings()).sikayetMinKarakter).toBe(60);

    const rejected = await report(student, second.question.id, shortText);
    expect(rejected.status).toBe(400);
  });

  test("aralık dışı değer alanda hata verir ve gönderilmez", async ({ page }) => {
    await openAsMudur(page, mudur);
    const writes: string[] = [];
    await page.route("**/api/admin/settings", async (route) => {
      if (route.request().method() === "PUT") writes.push("put");
      await route.fallback();
    });
    await page.getByTestId("setting-puanDogruCevap").fill("101");
    await page.getByTestId("settings-save").click();
    await expect(page.getByText("0 ile 100 arasında olmalıdır.")).toBeVisible();
    await expect(page.getByTestId("setting-puanDogruCevap")).toHaveAttribute("aria-invalid", "true");
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "Değişiklikleri Geri Al" }).click();
    await expect(page.getByTestId("setting-puanDogruCevap")).toHaveValue(String(original.puanDogruCevap));
  });

  test("çapraz kural ihlali ilgili alanlarda gösterilir", async ({ page }) => {
    await openAsMudur(page, mudur);
    const writes: string[] = [];
    await page.route("**/api/admin/settings", async (route) => {
      if (route.request().method() === "PUT") writes.push("put");
      await route.fallback();
    });
    const max = page.getByTestId("setting-yorumMaxDerinlik");
    const visible = page.getByTestId("setting-yorumGorunurDerinlik");
    const visibleValue = Number(await visible.inputValue());
    await max.fill(String(Math.max(1, visibleValue - 1)));
    await page.getByTestId("settings-save").click();
    await expect(page.getByText("Görünen derinlik, azami derinlikten büyük olamaz.")).toBeVisible();
    expect(writes).toHaveLength(0);
  });

  test("sunucu alan hatası ilgili alana bağlanır", async ({ page }) => {
    await openAsMudur(page, mudur);
    await page.route("**/api/admin/settings", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      return route.fulfill({
        status: 400,
        contentType: "application/problem+json",
        body: JSON.stringify({
          title: "Doğrulama hatası",
          status: 400,
          errors: { yorumGorunurDerinlik: ["Sunucu: görünen derinlik büyük."] },
        }),
      });
    });
    await page.getByTestId("setting-puanDogruCevap").fill(String(original.puanDogruCevap! === 7 ? 8 : 7));
    await page.getByTestId("settings-save").click();
    await expect(page.getByText("Sunucu: görünen derinlik büyük.")).toBeVisible();
    await expect(page.getByTestId("setting-yorumGorunurDerinlik")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("problem-banner")).toHaveCount(0);
  });

  test("429 yanıtında geri sayım gösterilir ve kaydet bekler", async ({ page }) => {
    await openAsMudur(page, mudur);
    await page.route("**/api/admin/settings", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      return route.fulfill({
        status: 429,
        headers: { "retry-after": "4" },
        contentType: "application/problem+json",
        body: JSON.stringify({ title: "Çok fazla istek gönderildi.", status: 429 }),
      });
    });
    await page.getByTestId("setting-puanDogruCevap").fill(String(original.puanDogruCevap! === 7 ? 8 : 7));
    await page.getByTestId("settings-save").click();
    await expect(page.getByTestId("problem-banner")).toContainText("saniye sonra tekrar deneyebilirsiniz");
    await expect(page.getByTestId("settings-save")).toBeDisabled();
    await expect(page.getByTestId("settings-save")).toBeEnabled({ timeout: 10_000 });
  });

  test("kirli formda sayfadan ayrılırken uyarı çıkar", async ({ page }) => {
    await openAsMudur(page, mudur);
    await page.getByTestId("setting-puanDogruCevap").fill(String(original.puanDogruCevap! === 7 ? 8 : 7));
    let message = "";
    page.once("dialog", async (dialog) => {
      message = dialog.message();
      await dialog.dismiss();
    });
    await page.locator(`a[href^="/"]:visible`).first().click();
    await expect.poll(() => message).toContain("Kaydedilmemiş değişiklikler");
    await expect(page).toHaveURL(/\/yonetim\/ayarlar$/);
    await page.getByRole("button", { name: "Değişiklikleri Geri Al" }).click();
  });

  test("dosya temizliği sonucu görünür; 429 ve 409 hataları gösterilir", async ({ page }) => {
    await openAsMudur(page, mudur);
    await page.getByTestId("cleanup-open").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("kalıcı olarak silinir");
    await dialog.getByRole("button", { name: "Vazgeç" }).click();
    await expect(page.getByTestId("cleanup-result")).toHaveCount(0);

    await page.getByTestId("cleanup-open").click();
    await page.getByRole("dialog").getByRole("button", { name: "Temizle" }).click();
    await expect(page.getByTestId("cleanup-result")).toContainText(/dosya silindi|bulunmadı/);

    await page.route("**/api/admin/files/cleanup", async (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/problem+json",
        body: JSON.stringify({ title: "İşlem çakışması oluştu.", status: 409, detail: "Temizlik zaten çalışıyor." }),
      }),
    );
    await page.getByTestId("cleanup-open").click();
    await page.getByRole("dialog").getByRole("button", { name: "Temizle" }).click();
    await expect(page.getByRole("dialog").getByTestId("problem-banner")).toContainText("Temizlik zaten çalışıyor.");
    await page.getByRole("dialog").getByRole("button", { name: "Vazgeç" }).click();

    await page.unroute("**/api/admin/files/cleanup");
    await page.route("**/api/admin/files/cleanup", async (route) =>
      route.fulfill({
        status: 429,
        headers: { "retry-after": "4" },
        contentType: "application/problem+json",
        body: JSON.stringify({ title: "Çok fazla istek gönderildi.", status: 429 }),
      }),
    );
    await page.getByTestId("cleanup-open").click();
    await page.getByRole("dialog").getByRole("button", { name: "Temizle" }).click();
    await expect(page.getByTestId("maintenance-card").getByTestId("problem-banner")).toContainText("saniye sonra tekrar deneyebilirsiniz");
    await expect(page.getByTestId("cleanup-open")).toBeDisabled();
  });

  test("375, 768 ve 1280 genişliklerinde taşma yok ve axe temiz", async ({ page }, testInfo) => {
    await openAsMudur(page, mudur);
    const widths = testInfo.project.name === "webkit-iphone" ? [null] : [375, 768, 1280];
    for (const width of widths) {
      if (width !== null) await page.setViewportSize({ width, height: 900 });
      await expect(page.getByTestId("maintenance-card")).toBeVisible();
      await expectNoAxeViolations(page, `ayarlar-${width ?? "iphone"}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("öğretmen ayarlar sayfasına giremez", async ({ page }) => {
    const teacher = await activeUser("ogretmen", "ayarogt");
    await login(page, teacher.userName, teacher.password);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await page.goto(ROUTE);
    await expect(page).not.toHaveURL(/\/yonetim/);
    await expect(page.getByTestId("setting-sikayetMinKarakter")).toHaveCount(0);
  });

  test("öğrenci ayarlar sayfasına giremez", async ({ page }) => {
    const student = await activeUser("ogrenci", "ayarogr2");
    await login(page, student.userName, student.password);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await page.goto(ROUTE);
    await expect(page).not.toHaveURL(/\/yonetim/);
    await expect(page.getByTestId("setting-sikayetMinKarakter")).toHaveCount(0);
  });
});
