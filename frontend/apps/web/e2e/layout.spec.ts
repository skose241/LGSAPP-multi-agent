import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { activateAccount, createAccount, VALID_PASSWORD } from "./support/backend";
import { expect, login, test } from "./support/fixtures";

const outDir = process.env.F2_SCREENSHOT_DIR ?? path.join(process.cwd(), "test-results", "f2");

async function mudurSession(page: Page) {
  const account = await createAccount("mudur");
  await activateAccount(account);
  await login(page, account.userName, VALID_PASSWORD);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
}

async function expectClearOfTabBar(page: Page, name: string, projectName: string) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width >= 1024) return;
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `alt-bosluk-${name}-${projectName}.png`) });
  const result = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Alt menü"]');
    if (!nav) return null;
    const top = nav.getBoundingClientRect().top;
    let bottom = 0;
    document.querySelectorAll("main a, main button, main input, main select, main textarea").forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) bottom = Math.max(bottom, rect.bottom);
    });
    return { top, bottom };
  });
  expect(result, "alt menü bulunamadı").not.toBeNull();
  expect(result!.bottom, `${name}: son etkileşimli öğe alt menüyle kesişiyor`).toBeLessThanOrEqual(result!.top);
}

test.describe("alt sekme çubuğu boşluğu", () => {
  test("yeni kullanıcı başarı ekranı", async ({ page }, testInfo) => {
    await mudurSession(page);
    await page.goto("/yonetim/kullanicilar/yeni");
    await page.getByLabel(/^Kullanıcı adı\*?$/).fill(`alt.${Date.now().toString(36)}`);
    await page.getByLabel(/^Ad\*?$/).fill("Alt");
    await page.getByLabel(/^Soyad\*?$/).fill("Boşluk");
    await page.getByRole("button", { name: "Hesap oluştur" }).click();
    await expect(page.getByTestId("one-time-password")).toBeVisible();
    await expectClearOfTabBar(page, "tek-seferlik-sifre", testInfo.project.name);
  });

  test("kullanıcı detayı", async ({ page }, testInfo) => {
    await mudurSession(page);
    const teacher = await createAccount("ogretmen");
    await activateAccount(teacher);
    await page.goto(`/yonetim/kullanicilar/${teacher.id}`);
    await expect(page.getByTestId("action-branch")).toBeVisible();
    await expectClearOfTabBar(page, "kullanici-detay", testInfo.project.name);
  });

  test("profil", async ({ page }, testInfo) => {
    await mudurSession(page);
    await page.goto("/profil");
    await expect(page.getByRole("heading", { name: "Profil" })).toBeVisible();
    await expectClearOfTabBar(page, "profil", testInfo.project.name);
  });

  test("pano", async ({ page }, testInfo) => {
    await mudurSession(page);
    await expectClearOfTabBar(page, "pano", testInfo.project.name);
  });
});
