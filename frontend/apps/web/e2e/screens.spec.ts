import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { activateAccount, createAccount, VALID_PASSWORD } from "./support/backend";
import { expect, login, test } from "./support/fixtures";

const outDir = process.env.SCREENSHOT_DIR ?? path.join(process.cwd(), "test-results", "f1b");
const widths = [375, 1280];

async function capture(page: Page, testInfo: TestInfo, name: string, width: number | null) {
  fs.mkdirSync(outDir, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  const label = width === null ? `${name}-${testInfo.project.name}` : `${name}-${width}`;
  await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
  }));
  fs.writeFileSync(path.join(outDir, `axe-${label}.json`), JSON.stringify(summary, null, 2));
  expect(summary, `axe ${label}`).toEqual([]);
}

function sizes(testInfo: TestInfo): (number | null)[] {
  return testInfo.project.name === "webkit-iphone" ? [null] : widths;
}

async function forEachSize(page: Page, testInfo: TestInfo, name: string, prepare?: () => Promise<void>) {
  for (const width of sizes(testInfo)) {
    if (width !== null) await page.setViewportSize({ width, height: 900 });
    if (prepare) await prepare();
    await capture(page, testInfo, name, width);
  }
}

test.describe("ekranlar", () => {
  test("giriş", async ({ page }, testInfo) => {
    await forEachSize(page, testInfo, "giris", async () => {
      await page.goto("/giris", { waitUntil: "networkidle" });
    });
  });

  test("giriş hata ve oturum bandı", async ({ page }, testInfo) => {
    await forEachSize(page, testInfo, "giris-hata", async () => {
      await page.goto("/giris?neden=oturum", { waitUntil: "networkidle" });
      await page.getByLabel("Kullanıcı Adı").fill("yok.kullanici");
      await page.getByLabel(/^Şifre\*?$/).fill("Yanlis-1");
      await page.getByRole("button", { name: "Giriş Yap" }).click();
      await expect(page.getByTestId("problem-banner")).toBeVisible();
    });
  });

  test("şifremi unuttum ve kurtarma", async ({ page }, testInfo) => {
    await forEachSize(page, testInfo, "sifremi-unuttum", async () => {
      await page.goto("/sifremi-unuttum", { waitUntil: "networkidle" });
    });
    await forEachSize(page, testInfo, "kurtarma", async () => {
      await page.goto("/kurtarma", { waitUntil: "networkidle" });
    });
  });

  test("şifre değiştir", async ({ page }, testInfo) => {
    const account = await createAccount("ogrenci");
    await login(page, account.userName, account.oneTimePassword);
    await expect(page).toHaveURL(/\/sifre-degistir/);
    await forEachSize(page, testInfo, "sifre-degistir", async () => {
      await page.goto("/sifre-degistir", { waitUntil: "networkidle" });
      await expect(page.getByLabel("Mevcut Şifre")).toBeVisible();
    });
  });

  test("pano ve profil", async ({ page }, testInfo) => {
    const account = await createAccount("ogrenci");
    await activateAccount(account);
    await login(page, account.userName, VALID_PASSWORD);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await forEachSize(page, testInfo, "pano", async () => {
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    });
    await forEachSize(page, testInfo, "profil", async () => {
      await page.goto("/profil", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Profil" })).toBeVisible();
    });
  });

  test("müdür panosu", async ({ page }, testInfo) => {
    const account = await createAccount("mudur");
    await activateAccount(account);
    await login(page, account.userName, VALID_PASSWORD);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await forEachSize(page, testInfo, "pano-mudur", async () => {
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    });
  });

  test("kurtarma kodları ekranı", async ({ page }, testInfo) => {
    const account = await createAccount("mudur");
    await login(page, account.userName, account.oneTimePassword);
    await page.getByLabel("Mevcut Şifre").fill(account.oneTimePassword);
    await page.getByLabel(/^Yeni Şifre\*?$/).fill("Mudur-Uzun-Sifre-2026");
    await page.getByLabel("Yeni Şifre (Tekrar)").fill("Mudur-Uzun-Sifre-2026");
    await page.getByRole("button", { name: "Şifreyi Kaydet" }).click();
    await expect(page.getByTestId("recovery-codes")).toBeVisible();
    await forEachSize(page, testInfo, "kurtarma-kodlari", async () => {
      await expect(page.getByTestId("recovery-codes")).toBeVisible();
    });
  });
});
