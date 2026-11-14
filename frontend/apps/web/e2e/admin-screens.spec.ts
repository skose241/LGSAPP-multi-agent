import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { activateAccount, createAccount, requestPasswordReset, VALID_PASSWORD } from "./support/backend";
import { expect, login, test } from "./support/fixtures";

const outDir = process.env.F2_SCREENSHOT_DIR ?? path.join(process.cwd(), "test-results", "f2");
const widths = [375, 1280];

async function capture(page: Page, testInfo: TestInfo, name: string, width: number | null) {
  fs.mkdirSync(outDir, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  const label = width === null ? `${name}-${testInfo.project.name}` : `${name}-${width}`;
  const style = await page.addStyleTag({
    content: "nextjs-portal{display:none!important} nav[aria-label=\"Alt menü\"]{position:static!important}",
  });
  const size = await page.evaluate(() => ({ width: window.innerWidth, height: document.documentElement.scrollHeight }));
  await page.screenshot({
    path: path.join(outDir, `${label}.png`),
    fullPage: true,
    clip: { x: 0, y: 0, width: size.width, height: Math.min(size.height, 6000) },
  });
  await style.evaluate((element) => (element as HTMLElement).remove());
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

async function forEachSize(page: Page, testInfo: TestInfo, name: string, prepare: () => Promise<void>) {
  const sizes: (number | null)[] = testInfo.project.name === "webkit-iphone" ? [null] : widths;
  for (const width of sizes) {
    if (width !== null) await page.setViewportSize({ width, height: 900 });
    await prepare();
    await capture(page, testInfo, name, width);
  }
}

async function mudurSession(page: Page) {
  const account = await createAccount("mudur");
  await activateAccount(account);
  await login(page, account.userName, VALID_PASSWORD);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
  return account;
}

test.describe("müdür ekranları", () => {
  test("pano ve kullanıcı listesi", async ({ page }, testInfo) => {
    await mudurSession(page);
    const student = await createAccount("ogrenci", "ogrenci", { firstName: "Elif", lastName: "Yılmaz" });
    await activateAccount(student);
    await createAccount("ogretmen", "ogretmen", { firstName: "Ayşe", lastName: "Demir" });
    await requestPasswordReset(student.userName);

    await forEachSize(page, testInfo, "mudur-pano", async () => {
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(page.getByText("Bekleyen talep", { exact: true })).toBeVisible();
    });
    await forEachSize(page, testInfo, "kullanici-listesi", async () => {
      await page.goto("/yonetim/kullanicilar", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Kullanıcılar" })).toBeVisible();
      await expect(page.getByTestId("page-info")).toBeVisible();
    });
  });

  test("yeni kullanıcı formu ve tek seferlik şifre", async ({ page }, testInfo) => {
    await mudurSession(page);
    await forEachSize(page, testInfo, "yeni-kullanici", async () => {
      await page.goto("/yonetim/kullanicilar/yeni", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Yeni kullanıcı" })).toBeVisible();
    });

    await page.goto("/yonetim/kullanicilar/yeni", { waitUntil: "networkidle" });
    await page.getByLabel(/^Rol\*?$/).selectOption("ogretmen");
    await page.getByLabel(/^Kullanıcı adı\*?$/).fill(`ayse.${Date.now().toString(36)}`);
    await page.getByLabel(/^Ad\*?$/).fill("Ayşe");
    await page.getByLabel(/^Soyad\*?$/).fill("Demir");
    await page.getByRole("button", { name: "Hesap oluştur" }).click();
    await expect(page.getByTestId("one-time-password")).toBeVisible();
    await forEachSize(page, testInfo, "tek-seferlik-sifre", async () => {
      await expect(page.getByTestId("one-time-password")).toBeVisible();
    });
  });

  test("kullanıcı detayı ve onay dialogu", async ({ page }, testInfo) => {
    await mudurSession(page);
    const teacher = await createAccount("ogretmen", "ogretmen", { firstName: "Ayşe", lastName: "Demir" });
    await activateAccount(teacher);
    await forEachSize(page, testInfo, "kullanici-detay", async () => {
      await page.goto(`/yonetim/kullanicilar/${teacher.id}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("user-name")).toBeVisible();
    });
    await page.goto(`/yonetim/kullanicilar/${teacher.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("action-ban").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await forEachSize(page, testInfo, "onay-dialogu", async () => {
      await expect(page.getByRole("dialog")).toBeVisible();
    });
  });

  test("şifre talepleri", async ({ page }, testInfo) => {
    await mudurSession(page);
    for (const name of ["Elif Yılmaz", "Mert Kaya"]) {
      const [firstName, lastName] = name.split(" ") as [string, string];
      const student = await createAccount("ogrenci", "ogrenci", { firstName, lastName });
      await activateAccount(student);
      await requestPasswordReset(student.userName);
    }
    await forEachSize(page, testInfo, "sifre-talepleri", async () => {
      await page.goto("/yonetim/sifre-talepleri", { waitUntil: "networkidle" });
      await expect(page.getByTestId("request-name").first()).toBeVisible();
    });
  });
});
