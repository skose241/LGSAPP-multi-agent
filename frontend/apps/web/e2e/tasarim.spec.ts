import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const outDir = process.env.SCREENSHOT_DIR ?? path.join(process.cwd(), "test-results", "tasarim");
const widths = [375, 768, 1280, 1440];

test.describe("tasarim vitrini", () => {
  test.beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
  });

  for (const width of widths) {
    test(`${width}px tam sayfa ve erisilebilirlik`, async ({ page }, testInfo) => {
      const isWebkit = testInfo.project.name === "webkit-iphone";
      test.skip(isWebkit && width !== 375, "cihaz genisligi sabit");
      if (!isWebkit) await page.setViewportSize({ width, height: 900 });
      await page.goto("/tasarim", { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalScroll, "yatay kaydirma olmamali").toBe(false);

      const tooSmall = await page.evaluate(() => {
        const targets = Array.from(document.querySelectorAll("button, a[href], [role='radio']"));
        return targets
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 && rect.height > 0 && (rect.height < 43.5 || rect.width < 43.5))
          .map(({ el, rect }) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(rect.width)}x${Math.round(rect.height)}`);
      });
      expect(tooSmall, "dokunma hedefleri 44px alti").toEqual([]);

      const small = await page.evaluate(() => {
        const fields = Array.from(document.querySelectorAll("input, textarea, select"));
        return fields.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).length;
      });
      expect(small, "16px altindaki girdi sayisi").toBe(0);

      const label = isWebkit ? testInfo.project.name : `${testInfo.project.name}-${width}`;
      const name = `${label}.png`;
      await page.screenshot({ path: path.join(outDir, name), fullPage: true });

      if (!isWebkit && width >= 1280) {
        await page.locator("#kabuk").screenshot({ path: path.join(outDir, `kabuk-${width}.png`) });
      }

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .analyze();
      const summary = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      }));
      fs.writeFileSync(
        path.join(outDir, `axe-${label}.json`),
        JSON.stringify(summary, null, 2),
      );
      expect(summary, "axe ihlalleri").toEqual([]);
    });
  }
});
