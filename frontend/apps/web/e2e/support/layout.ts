import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { expect } from "./fixtures";

const outDir = process.env.F2_SCREENSHOT_DIR ?? path.join(process.cwd(), "test-results", "f2");

export async function expectClearOfTabBar(page: Page, name: string, projectName: string) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width >= 1024) return;
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `alt-bosluk-${name}-${projectName}.png`) });
  const result = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Alt Menü"]');
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
