import type { Locator, Page } from "@playwright/test";
import { ensureFullWeekSchedule } from "./support/assignment-data";
import { expectNoAxeViolations } from "./support/axe";
import { adminToken, backend } from "./support/backend";
import { expect, login, test } from "./support/fixtures";
import { activeUser } from "./support/student-data";

interface ScheduleBody {
  lessons: { id: number; name: string }[];
  items: { isoDayOfWeek: number; lessonId: number; questionCount: number }[];
}

const ROUTE = "/yonetim/ders-programi";

async function readSchedule(): Promise<ScheduleBody> {
  const token = await adminToken();
  const result = await backend<ScheduleBody>("GET", "/api/admin/generation-schedule", { token });
  expect(result.status).toBe(200);
  return result.body;
}

async function restore(snapshot: ScheduleBody) {
  const token = await adminToken();
  const result = await backend("PUT", "/api/admin/generation-schedule", { token, body: { items: snapshot.items } });
  expect(result.status).toBe(200);
}

async function openAsMudur(page: Page) {
  const mudur = await activeUser("mudur", "program");
  await login(page, mudur.userName, mudur.password);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
  await page.goto(ROUTE);
  await expect(page.getByRole("heading", { name: "Ders Programı", level: 1 })).toBeVisible();
}

function cell(page: Page, day: number, lessonId: number): Locator {
  return page.locator(`[data-testid="schedule-cell"][data-day="${day}"][data-lesson="${lessonId}"]`).locator("visible=true");
}

async function expandDay(page: Page, dayName: string) {
  const toggle = page.getByRole("button", { name: new RegExp(`^${dayName}`) });
  if ((await toggle.count()) > 0 && (await toggle.first().isVisible()) && (await toggle.first().getAttribute("aria-expanded")) === "false") {
    await toggle.first().click();
  }
}

test.describe.configure({ mode: "serial" });

test.describe("ders programı", () => {
  let snapshot: ScheduleBody;

  test.beforeAll(async () => {
    await ensureFullWeekSchedule();
    snapshot = await readSchedule();
  });

  test.afterAll(async () => {
    if (snapshot) await restore(snapshot);
  });

  test("değer kaydedilir ve yenilemede korunur", async ({ page }) => {
    const lesson = snapshot.lessons[0]!;
    const original = snapshot.items.find((item) => item.isoDayOfWeek === 1 && item.lessonId === lesson.id)!.questionCount;
    const next = original === 7 ? 6 : 7;
    await openAsMudur(page);
    await expect(page.getByText("17.30")).toBeVisible();
    await expect(page.getByRole("link", { name: "Konu Planına Git" })).toHaveAttribute("href", "/ogretmen/konu-plani");
    await expect(page.getByTestId("schedule-save")).toBeDisabled();

    const input = cell(page, 1, lesson.id);
    await expect(input).toHaveValue(String(original));
    await expect(input).toHaveAccessibleName(`Pazartesi ${lesson.name} soru adedi`);
    await input.fill(String(next));
    await expect(page.getByTestId("schedule-save")).toBeEnabled();
    await page.getByTestId("schedule-save").click();
    await expect(page.getByTestId("schedule-save")).toBeDisabled();
    await expect(page.getByText("Değişiklik yok.")).toBeVisible();

    const saved = await readSchedule();
    expect(saved.items.find((item) => item.isoDayOfWeek === 1 && item.lessonId === lesson.id)?.questionCount).toBe(next);
    expect(saved.items.length).toBe(snapshot.items.length);

    await page.reload();
    await expect(cell(page, 1, lesson.id)).toHaveValue(String(next));
    await restore(snapshot);
  });

  test("geçersiz değer hücrede hata gösterir, sunucu hatası hücreye bağlanır", async ({ page }) => {
    const lesson = snapshot.lessons[0]!;
    await openAsMudur(page);
    const input = cell(page, 1, lesson.id);
    for (const bad of ["abc", "21", "-1", "1.5", ""]) {
      await input.fill(bad);
      await page.getByTestId("schedule-save").click();
      await expect(input).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByTestId("schedule-errors")).toContainText("0 ile 20 arasında");
      await expect(page.getByTestId("schedule-errors")).toContainText(lesson.name);
      const describedBy = await input.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      await expect(page.locator(`[id="${describedBy}"]`)).toBeVisible();
    }
    const stored = snapshot.items.find((item) => item.isoDayOfWeek === 1 && item.lessonId === lesson.id)!.questionCount;
    expect((await readSchedule()).items.find((item) => item.isoDayOfWeek === 1 && item.lessonId === lesson.id)?.questionCount).toBe(stored);
    await input.fill("3");
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("schedule-errors")).toHaveCount(0);

    await page.route("**/api/admin/generation-schedule", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      return route.fulfill({
        status: 400,
        contentType: "application/problem+json",
        body: JSON.stringify({ title: "Ders programı geçersiz.", status: 400, errors: { "items[0]": ["Sunucu: bu hücre reddedildi."] } }),
      });
    });
    await input.fill(String(stored === 3 ? 4 : 3));
    await page.getByTestId("schedule-save").click();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("schedule-errors")).toContainText("Sunucu: bu hücre reddedildi.");
    await expect(page.getByTestId("problem-banner")).toHaveCount(0);
    await page.unroute("**/api/admin/generation-schedule");
  });

  test("429 yanıtı bekleme bandı gösterir", async ({ page }) => {
    const lesson = snapshot.lessons[0]!;
    await openAsMudur(page);
    await page.route("**/api/admin/generation-schedule", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      return route.fulfill({ status: 429, headers: { "retry-after": "30" }, contentType: "application/problem+json", body: JSON.stringify({ title: "Çok fazla istek", status: 429 }) });
    });
    const stored = snapshot.items.find((item) => item.isoDayOfWeek === 1 && item.lessonId === lesson.id)!.questionCount;
    await cell(page, 1, lesson.id).fill(String(stored === 5 ? 6 : 5));
    await page.getByTestId("schedule-save").click();
    await expect(page.getByTestId("problem-banner")).toContainText("saniye sonra");
    await expect(page.getByTestId("schedule-save")).toBeDisabled();
    await page.unroute("**/api/admin/generation-schedule");
  });

  test("değişiklik varken sayfadan ayrılma uyarısı çıkar", async ({ page }) => {
    const lesson = snapshot.lessons[0]!;
    await openAsMudur(page);
    const stored = snapshot.items.find((item) => item.isoDayOfWeek === 1 && item.lessonId === lesson.id)!.questionCount;
    const link = page.getByRole("link", { name: "Konu Planına Git" });

    await cell(page, 1, lesson.id).fill(String(stored + 1));
    await cell(page, 1, lesson.id).fill(String(stored));
    await expect(page.getByTestId("schedule-save")).toBeDisabled();

    await cell(page, 1, lesson.id).fill(String(stored === 9 ? 8 : 9));
    const messages: string[] = [];
    page.once("dialog", async (dialog) => {
      messages.push(dialog.message());
      await dialog.dismiss();
    });
    await link.click();
    await expect.poll(() => messages.length).toBe(1);
    expect(messages[0]).toContain("Kaydedilmemiş değişiklikler");
    await expect(page).toHaveURL(/\/yonetim\/ders-programi$/);
    await page.getByRole("button", { name: "Değişiklikleri Geri Al" }).click();
    await expect(cell(page, 1, lesson.id)).toHaveValue(String(stored));
  });

  test("375/768/1280 genişlikte taşma yok ve axe temiz", async ({ page }, testInfo) => {
    const lesson = snapshot.lessons[0]!;
    await openAsMudur(page);
    const sizes: (number | null)[] = testInfo.project.name === "webkit-iphone" ? [null] : [375, 768, 1280];
    for (const size of sizes) {
      if (size !== null) await page.setViewportSize({ width: size, height: 900 });
      await page.goto(ROUTE);
      await expect(cell(page, 1, lesson.id)).toBeVisible();
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `taşma ${size ?? "iphone"}`).toBeLessThanOrEqual(0);
      await expectNoAxeViolations(page, `ders-programi ${size ?? "iphone"}`);
      await cell(page, 1, lesson.id).fill("abc");
      await page.getByTestId("schedule-save").click();
      await expect(page.getByTestId("schedule-errors")).toBeVisible();
      const overflowWithError = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflowWithError, `hatalı taşma ${size ?? "iphone"}`).toBeLessThanOrEqual(0);
      await expectNoAxeViolations(page, `ders-programi hata ${size ?? "iphone"}`);
    }
  });

  test("mobilde gün akordeonu açılıp kapanır", async ({ page }) => {
    const lesson = snapshot.lessons[0]!;
    await page.setViewportSize({ width: 375, height: 900 });
    await openAsMudur(page);
    await expect(cell(page, 1, lesson.id)).toBeVisible();
    await expect(cell(page, 3, lesson.id)).toHaveCount(0);
    await expandDay(page, "Çarşamba");
    await expect(cell(page, 3, lesson.id)).toBeVisible();
    await page.getByRole("button", { name: /^Çarşamba/ }).click();
    await expect(cell(page, 3, lesson.id)).toHaveCount(0);
  });

  test("öğretmen ve öğrenci erişemez", async ({ page }) => {
    const teacher = await activeUser("ogretmen", "programht");
    const student = await activeUser("ogrenci", "programog");
    for (const user of [teacher, student]) {
      const denied = await backend("GET", "/api/admin/generation-schedule", { token: user.token });
      expect(denied.status).toBe(403);
      const deniedPut = await backend("PUT", "/api/admin/generation-schedule", { token: user.token, body: { items: [] } });
      expect(deniedPut.status).toBe(403);
    }
    await login(page, teacher.userName, teacher.password);
    await page.goto(ROUTE);
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole("heading", { name: "Ders Programı", level: 1 })).toHaveCount(0);
    await page.context().clearCookies();
    await login(page, student.userName, student.password);
    await page.goto(ROUTE);
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole("heading", { name: "Ders Programı", level: 1 })).toHaveCount(0);
  });
});
