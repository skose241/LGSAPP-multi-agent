import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { activeUser, answerQuestion, createTextQuestion, postComment, uploadQuestionImage } from "./support/student-data";
import { expect, test } from "./support/fixtures";
import { freshQuestion, studentLogin, validExplanation, world, authorFor } from "./support/world";

const outDir = process.env.F3_SCREENSHOT_DIR ?? path.join(process.cwd(), "test-results", "f3");
const widths = [375, 1280];

async function capture(page: Page, testInfo: TestInfo, name: string, width: number | null) {
  fs.mkdirSync(outDir, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  const label = width === null ? `${name}-${testInfo.project.name}` : `${name}-${width}`;
  const style = await page.addStyleTag({
    content: 'nextjs-portal{display:none!important} nav[aria-label="Alt Menü"]{position:static!important}',
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

test.describe("öğrenci ekranları", () => {
  test("pano, sorular ve cevaplanmamış soru", async ({ page }, testInfo) => {
    const w = await world();
    await freshQuestion(`Ekran sorusu ${Date.now().toString(36)}: $x^2+3x$ ifadesinin değeri kaçtır?`);
    const author = await authorFor(w.lessons[0]!.id);
    const imageId = await uploadQuestionImage(author);
    const withImage = await createTextQuestion(author, w.lessons[0]!.id, "Görselli soru", 3, {
      text: null,
      imageFileId: imageId,
      optionA: null,
      optionB: null,
      optionC: null,
      optionD: null,
    });
    await studentLogin(page);

    await forEachSize(page, testInfo, "pano", async () => {
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Son 7 Günün Soruları" })).toBeVisible();
      await expect(page.getByTestId("pool-question").first()).toBeVisible();
    });
    await forEachSize(page, testInfo, "sorular", async () => {
      await page.goto("/sorular", { waitUntil: "networkidle" });
      await expect(page.getByTestId("pool-question").first()).toBeVisible();
    });
    await forEachSize(page, testInfo, "soru-cevaplanmamis", async () => {
      await page.goto(`/sorular/${withImage.id}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("button", { name: "Cevabı Gönder" })).toBeVisible();
      await expect(page.locator("img[alt$='sorusu']").first()).toBeVisible();
    });
  });

  test("cevaplanmış soru, yorumlar ve yorum dizisi", async ({ page }, testInfo) => {
    const { question, world: w } = await freshQuestion(`Tartışma sorusu ${Date.now().toString(36)}: $\\frac{a}{b}$ kesri`);
    const student = await studentLogin(page);
    const other = await activeUser("ogrenci", "arkadas");
    await answerQuestion(other, question.id, 2, `Ben bu soruyu şöyle çözdüm: ${validExplanation(w.settings.aciklamaMinKarakter)}`);
    await answerQuestion(student, question.id, 1, validExplanation(w.settings.aciklamaMinKarakter));
    const root = await postComment(other, question.id, "Bence doğru cevap B şıkkı, işlemi yeniden kontrol et.");
    let parent = root.id;
    let target = root.id;
    for (let level = 1; level <= w.settings.yorumMaxDerinlik; level += 1) {
      const next = await postComment(level % 2 === 0 ? student : other, question.id, `Yanıt seviyesi ${level}`, parent);
      parent = next.id;
      if (level === 2) target = next.id;
    }

    await forEachSize(page, testInfo, "soru-cevaplanmis", async () => {
      await page.goto(`/sorular/${question.id}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("answer-result")).toBeVisible();
      await expect(page.getByTestId("comments-soru")).toBeVisible();
    });
    await forEachSize(page, testInfo, "yorum-dizisi", async () => {
      await page.goto(`/yorumlar/${target}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("comment").first()).toBeVisible();
    });
  });

  test("bildirimler, liderlik ve profil", async ({ page }, testInfo) => {
    const { question, world: w } = await freshQuestion(`Bildirim ekranı ${Date.now().toString(36)}`);
    const student = await studentLogin(page);
    await answerQuestion(student, question.id, 2, validExplanation(w.settings.aciklamaMinKarakter));
    const mine = await postComment(student, question.id, "Cevap veren herkese merhaba");
    const other = await activeUser("ogrenci", "yanit");
    await answerQuestion(other, question.id, 1, validExplanation(w.settings.aciklamaMinKarakter));
    await postComment(other, question.id, "Merhaba, sana yanıt yazıyorum", mine.id);

    await forEachSize(page, testInfo, "bildirimler", async () => {
      await page.goto("/bildirimler", { waitUntil: "networkidle" });
      await expect(page.getByTestId("notification").first()).toBeVisible();
    });
    await forEachSize(page, testInfo, "liderlik", async () => {
      await page.goto("/liderlik", { waitUntil: "networkidle" });
      await expect(page.getByTestId("my-rank")).toBeVisible();
    });
    await forEachSize(page, testInfo, "profil", async () => {
      await page.goto("/profil", { waitUntil: "networkidle" });
      await expect(page.getByTestId("profile-stats")).toBeVisible();
      await expect(page.getByTestId("lesson-bar").first()).toBeVisible();
    });
  });
});
