import { expectNoAxeViolations } from "./support/axe";
import { expect, login, test } from "./support/fixtures";
import { activeUser } from "./support/student-data";

test.describe("açık kaynak lisansları", () => {
  test("giriş yapmadan açılır, LGPL bildirimini ve bağımlılıkları gösterir", async ({ page }, testInfo) => {
    await page.goto("/lisanslar");
    await expect(page).toHaveURL(/\/lisanslar$/);
    await expect(page.getByRole("heading", { name: "Açık kaynak lisansları", level: 1 })).toBeVisible();

    const notice = page.getByTestId("lgpl-notice");
    await expect(notice).toContainText("LGPL-3.0");
    await expect(notice).toContainText("ayrı bir dosya (chunk)");
    await expect(notice).toContainText("değiştirilmiş bir sürümle değiştirip");

    for (const [id, name, version] of [
      ["heic-to", "heic-to", "1.6.7"],
      ["libheif", "libheif", "1.23.7"],
      ["libde265", "libde265", "1.0.16"],
    ] as const) {
      const card = page.getByTestId(`lgpl-${id}`);
      await expect(card.getByRole("heading", { name })).toBeVisible();
      await expect(card).toContainText(version);
      await expect(card).toContainText("LGPL-3.0");
      await expect(card).toContainText("Telif:");
      await expect(card.getByRole("link", { name: /kaynak kodu/ }).first()).toHaveAttribute("href", /^https:\/\//);
    }

    const list = page.getByTestId("third-party-list");
    await expect(list).toContainText("katex");
    await expect(list).toContainText("MIT");
    await expect(list.getByRole("link", { name: "heic-to (npm)" })).toHaveAttribute("href", /npmjs\.com\/package\/heic-to/);

    const widths = testInfo.project.name === "webkit-iphone" ? [null] : [375, 1280];
    for (const width of widths) {
      if (width !== null) await page.setViewportSize({ width, height: 900 });
      await expectNoAxeViolations(page, `lisanslar-${width ?? "iphone"}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("lisans metinleri statik dosya olarak sunulur", async ({ page }) => {
    const files: [string, RegExp][] = [
      ["/licenses/heic-to-LICENSE.txt", /GNU LESSER GENERAL PUBLIC LICENSE/],
      ["/licenses/libheif-COPYING.txt", /GNU LESSER GENERAL PUBLIC LICENSE/],
      ["/licenses/libde265-COPYING.txt", /GNU LESSER GENERAL PUBLIC LICENSE/],
      ["/licenses/GPL-3.0.txt", /GNU GENERAL PUBLIC LICENSE/],
    ];
    for (const [href, pattern] of files) {
      const response = await page.request.get(href);
      expect(response.status(), href).toBe(200);
      expect(await response.text(), href).toMatch(pattern);
    }

    await page.goto("/lisanslar");
    const links = await page.locator('a[href^="/licenses/"]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));
    expect(links.sort()).toEqual(["/licenses/GPL-3.0.txt", "/licenses/heic-to-LICENSE.txt", "/licenses/libde265-COPYING.txt", "/licenses/libheif-COPYING.txt"]);
  });

  test("olmayan lisans dosyası 404 döner, alt yollar girişe yönlenir", async ({ page }) => {
    const missing = await page.request.get("/licenses/yok.txt");
    expect(missing.status()).toBe(404);
    await page.goto("/lisanslar/alt");
    await expect(page).toHaveURL(/\/giris/);
  });

  test("giriş ekranından, profil ve menü sayfalarından bağlantı verilir", async ({ page }) => {
    await page.goto("/giris");
    await page.getByRole("link", { name: "Açık kaynak lisansları" }).click();
    await expect(page).toHaveURL(/\/lisanslar$/);

    const student = await activeUser("ogrenci", "ogrenci");
    await login(page, student.userName, student.password);
    await page.goto("/profil");
    await page.getByRole("link", { name: "Açık kaynak lisansları" }).click();
    await expect(page).toHaveURL(/\/lisanslar$/);
    await page.getByRole("link", { name: "Uygulamaya dön" }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);

    const teacher = await activeUser("ogretmen", "hoca");
    await page.context().clearCookies();
    await login(page, teacher.userName, teacher.password);
    await page.goto("/menu");
    await page.getByRole("link", { name: "Açık kaynak lisansları" }).click();
    await expect(page).toHaveURL(/\/lisanslar$/);
  });
});
