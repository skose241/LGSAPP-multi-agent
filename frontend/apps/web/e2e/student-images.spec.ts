import { todayInIstanbul, addDaysToDateOnly } from "@lgs/api";
import { createOpenAssignment, createTextQuestion, uploadQuestionImage } from "./support/student-data";
import { expect, test } from "./support/fixtures";
import { studentLogin, world } from "./support/world";

test.describe("görselli sorular ve ödev kartı", () => {
  test("listede küçük resim, detayda tam boy görsel kullanılır", async ({ page }) => {
    const w = await world();
    const imageId = await uploadQuestionImage(w.teacher);
    const lesson = w.lessons[0]!;
    const question = await createTextQuestion(w.teacher, lesson.id, "Görselli soru", 2, {
      text: null,
      imageFileId: imageId,
      optionA: null,
      optionB: null,
      optionC: null,
      optionD: null,
    });
    await studentLogin(page);

    const detail = (await (await page.request.get(`/api/questions/${question.id}`)).json()) as {
      image: { url: string; thumbnailUrl: string | null; width: number };
    };
    expect(detail.image.thumbnailUrl).toBeTruthy();
    expect(detail.image.thumbnailUrl).not.toBe(detail.image.url);

    await page.goto("/sorular?durum=tumu");
    const thumb = page.locator(`a[href="/sorular/${question.id}"] img`).first();
    await expect(thumb).toBeVisible();
    expect(await thumb.getAttribute("src")).toBe(detail.image.thumbnailUrl);
    expect(await thumb.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    await page.goto(`/sorular/${question.id}`);
    const full = page.locator("img[alt$='sorusu']").first();
    await expect(full).toBeVisible();
    expect(await full.getAttribute("src")).toBe(detail.image.url);
    expect(await full.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    await page.getByRole("button", { name: /tam ekran/ }).click();
    await expect(page.getByRole("dialog").locator("img")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("pano açık ödevleri ilerlemeyle gösterir", async ({ page }) => {
    const w = await world();
    const today = todayInIstanbul();
    const title = `Pano ödevi ${Date.now().toString(36)}`;
    await createOpenAssignment(w.teacher, w.lessons[0]!.id, title, today, addDaysToDateOnly(today, 3));
    await studentLogin(page);
    await page.goto("/");
    const card = page.getByTestId("open-assignment").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card).toContainText("0 / 2 soru yapıldı");
    await expect(card.getByRole("progressbar")).toBeVisible();
  });
});
