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

  test("süresi dolan görsel bir kez yenilenir ve yeni adresle yüklenir", async ({ page }) => {
    const w = await world();
    const imageId = await uploadQuestionImage(w.teacher);
    const question = await createTextQuestion(w.teacher, w.lessons[0]!.id, "Süre dolumu sorusu", 2, {
      text: null,
      imageFileId: imageId,
      optionA: null,
      optionB: null,
      optionC: null,
      optionD: null,
    });
    await studentLogin(page);

    let detailCalls = 0;
    await page.route(`**/api/questions/${question.id}`, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      detailCalls += 1;
      if (detailCalls > 1) return route.continue();
      const response = await route.fetch();
      const body = (await response.json()) as { image: { url: string; thumbnailUrl?: string | null } };
      const mark = (url: string) => `${url}${url.includes("?") ? "&" : "?"}expiredprobe=1`;
      body.image.url = mark(body.image.url);
      if (body.image.thumbnailUrl) body.image.thumbnailUrl = mark(body.image.thumbnailUrl);
      return route.fulfill({ response, json: body });
    });
    await page.route(/expiredprobe=1/, (route) => route.abort());

    await page.goto(`/sorular/${question.id}`);
    const picture = page.locator("img[alt$='sorusu']").first();
    await expect(picture).toBeVisible();
    await expect.poll(() => picture.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await picture.getAttribute("src")).not.toContain("expiredprobe");
    await expect(page.getByText("Görsel yüklenemedi")).toHaveCount(0);
    expect(detailCalls).toBe(2);
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
