import type { Page } from "@playwright/test";
import { answeredQuestion, produceDispute, readSettings, setSettings } from "./support/ai";
import { activateAccount, backend, createAccount, VALID_PASSWORD } from "./support/backend";
import { expectNoAxeViolations } from "./support/axe";
import { expect, login, test } from "./support/fixtures";
import { activeUser } from "./support/student-data";
import { studentLogin, world, authorFor } from "./support/world";

async function mudurSession(page: Page) {
  const account = await createAccount("mudur");
  await activateAccount(account);
  await login(page, account.userName, VALID_PASSWORD);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
  return account;
}

const DEFAULTS = { aiGunlukCozumGlobalLimit: 1000, aiGunlukCozumLimit: 5, aiCozumAktifMi: 1 };

test.describe("müdür yapay zekâ ekranı", () => {
  test.beforeEach(async () => {
    await setSettings(DEFAULTS);
  });

  test.afterEach(async () => {
    await setSettings(DEFAULTS);
  });

  test("durum, devre kesici, kullanım tablosu ve tarih aralığı", async ({ page }, testInfo) => {
    await produceDispute();
    await mudurSession(page);
    await page.goto("/yonetim/yapay-zeka");
    await expect(page.getByRole("heading", { name: "Yapay Zekâ", level: 1 })).toBeVisible();

    const status = page.getByTestId("ai-status");
    await expect(status).toBeVisible();
    await expect(page.getByTestId("ai-provider")).toHaveText("Sahte (Test)");
    await expect(status).toContainText("Yapılandırıldı");
    await expect(page.getByTestId("ai-gates-ok")).toBeVisible();
    await expect(page.getByTestId("ai-gate")).toHaveCount(2);
    await expect(page.getByTestId("ai-global-usage")).toContainText("/ 1000");
    await expect(page.getByRole("progressbar", { name: "Bugünkü genel çözüm kullanımı" })).toBeVisible();

    const usage = page.getByTestId("ai-usage");
    await expect(page.getByTestId("usage-range")).toContainText("(7 gün)");
    await expect(page.getByTestId("ai-usage-table")).toBeVisible();
    const calls = Number((await page.getByTestId("total-calls").innerText()).replace(/\D/g, ""));
    expect(calls).toBeGreaterThan(0);
    await expect(usage.getByTestId("ai-usage-row").filter({ hasText: "Çözüm" }).first()).toBeVisible();
    await expect(page.getByTestId("total-cost")).toHaveText(/^\$\d/);
    await expect(page.getByRole("img", { name: /Günlük çağrı grafiği/ })).toBeVisible();

    await page.getByRole("button", { name: "30 Gün" }).click();
    await expect(page.getByRole("button", { name: "30 Gün" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("usage-range")).toContainText("(30 gün)");
    await page.getByRole("button", { name: "92 Gün" }).click();
    await expect(page.getByTestId("usage-range")).toContainText("(92 gün)");

    const widths = testInfo.project.name === "webkit-iphone" ? [null] : [375, 1280];
    for (const width of widths) {
      if (width !== null) await page.setViewportSize({ width, height: 900 });
      await expect(page.getByTestId("ai-usage-table")).toBeVisible();
      await expectNoAxeViolations(page, `yapay-zeka-${width ?? "iphone"}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("ayar doğrulaması hepsi-ya-hiç çalışır ve yalnız değişenler kaydedilir", async ({ page }) => {
    await mudurSession(page);
    await page.goto("/yonetim/yapay-zeka");
    const limit = page.getByTestId("setting-aiGunlukCozumLimit");
    const global = page.getByTestId("setting-aiGunlukCozumGlobalLimit");
    await expect(limit).toHaveValue("5");
    await expect(global).toHaveValue("1000");
    await expect(page.getByTestId("settings-save")).toBeDisabled();

    const writes: string[] = [];
    await page.route("**/api/admin/settings", async (route) => {
      if (route.request().method() === "PUT") writes.push(route.request().postData() ?? "");
      await route.continue();
    });

    await global.fill("999");
    await limit.fill("51");
    await page.getByTestId("settings-save").click();
    await expect(page.getByText("0 ile 50 arasında olmalıdır.")).toBeVisible();
    expect(writes).toHaveLength(0);
    expect((await readSettings()).aiGunlukCozumGlobalLimit).toBe(1000);

    await limit.fill("abc");
    await page.getByTestId("settings-save").click();
    await expect(page.getByText("Tam sayı girin.")).toBeVisible();

    await limit.fill("6");
    await page.getByTestId("settings-save").click();
    await expect(page.getByText("Ayarlar kaydedildi.").first()).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!)).toEqual({ aiGunlukCozumLimit: 6, aiGunlukCozumGlobalLimit: 999 });
    const saved = await readSettings();
    expect(saved.aiGunlukCozumLimit).toBe(6);
    expect(saved.aiGunlukCozumGlobalLimit).toBe(999);

    await limit.fill("7");
    await page.getByTestId("settings-save").click();
    await expect.poll(() => writes.length).toBe(2);
    expect(JSON.parse(writes[1]!)).toEqual({ aiGunlukCozumLimit: 7 });
    await expectNoAxeViolations(page, "yapay-zeka-ayarlar");
  });

  test("429 yanıtında geri sayım gösterilir ve kaydet düğmesi bekler", async ({ page }) => {
    await mudurSession(page);
    await page.goto("/yonetim/yapay-zeka");
    await page.route("**/api/admin/settings", async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 429,
        headers: { "retry-after": "4" },
        contentType: "application/problem+json",
        body: JSON.stringify({ title: "Çok fazla istek gönderildi.", detail: "Lütfen bir süre bekleyip tekrar deneyin.", status: 429 }),
      });
    });

    await page.getByTestId("setting-aiGunlukCozumLimit").fill("8");
    await page.getByTestId("settings-save").click();
    await expect(page.getByTestId("problem-banner")).toContainText("saniye sonra tekrar deneyebilirsiniz");
    await expect(page.getByTestId("settings-save")).toBeDisabled();
    await expect(page.getByTestId("settings-save")).toBeEnabled({ timeout: 10_000 });
    expect((await readSettings()).aiGunlukCozumLimit).toBe(5);
  });

  test("çözüm anahtarı kapatılınca öğrenci panelinde ulaşılamıyor durumu görünür", async ({ page, browser }) => {
    const w = await world();
    const creator = await authorFor(w.lessons[0]!.id);
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    try {
      const student = await studentLogin(studentPage);
      const question = await answeredQuestion(student, creator, w.lessons[0]!.id, 2, "Kapalı özellik");

      await mudurSession(page);
      await page.goto("/yonetim/yapay-zeka");
      const toggle = page.getByTestId("setting-aiCozumAktifMi");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await page.getByTestId("settings-save").click();
      await expect(page.getByText("Ayarlar kaydedildi.").first()).toBeVisible();
      await expect(page.getByTestId("ai-status")).toContainText("Kapalı");
      expect((await readSettings()).aiCozumAktifMi).toBe(0);

      const detail = await backend<{ aiSolutionState: string; permissions: { canRequestAiSolution: boolean } }>("GET", `/api/questions/${question.id}`, { token: student.token });
      expect(detail.body.aiSolutionState).toBe("unavailable");
      expect(detail.body.permissions.canRequestAiSolution).toBe(false);

      await studentPage.goto(`/sorular/${question.id}`);
      await expect(studentPage.getByTestId("ai-state-unavailable")).toBeVisible();
      await expect(studentPage.getByTestId("ai-request")).toHaveCount(0);
    } finally {
      await studentContext.close();
    }
  });

  test("öğretmen ve öğrenci yönetim ekranına giremez", async ({ page }) => {
    const teacher = await activeUser("ogretmen", "hoca");
    const settings = await backend("GET", "/api/admin/settings", { token: teacher.token });
    expect(settings.status).toBe(403);
    const usage = await backend("GET", "/api/admin/ai/usage", { token: teacher.token });
    expect(usage.status).toBe(403);

    await login(page, teacher.userName, teacher.password);
    await page.goto("/yonetim/yapay-zeka");
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });
});
