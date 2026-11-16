import type { Page } from "@playwright/test";
import {
  activeUser,
  answerQuestion,
  editCommentApi,
  getComments,
  postComment,
  type ActiveUser,
} from "./support/student-data";
import { expect, test } from "./support/fixtures";
import { freshQuestion, studentLogin, validExplanation, world } from "./support/world";

const PAYLOAD = "<img src=x onerror=window.__xss=1> $\\href{javascript:window.__xss=3}{tikla}$";

async function answered(student: ActiveUser, questionId: number, option = 2, text?: string) {
  const w = await world();
  return answerQuestion(student, questionId, option, text ?? validExplanation(w.settings.aciklamaMinKarakter));
}

function questionComments(page: Page) {
  return page.getByTestId("comments-soru");
}

test.describe("yorumlar", () => {
  test("yorum yazılır, yanıtlanır, düzenlenir ve silinir", async ({ page }) => {
    const { question } = await freshQuestion(`Yorum sorusu ${Date.now().toString(36)}`);
    const student = await studentLogin(page);
    await answered(student, question.id);
    await page.goto(`/sorular/${question.id}`);

    const section = questionComments(page);
    await section.getByLabel("Yorum metni").fill("İlk yorumum");
    await expect(section.getByTestId("comment-counter")).toContainText("11 /");
    await section.getByRole("button", { name: "Yorum yap" }).click();
    const root = section.getByTestId("comment").filter({ hasText: "İlk yorumum" }).first();
    await expect(root).toBeVisible();

    await root.getByRole("button", { name: "Yanıtla" }).first().click();
    await root.getByLabel("Yanıt metni").fill("Kendi yanıtım");
    await root.locator("form").getByRole("button", { name: "Yanıtla" }).click();
    const replyNode = root.getByRole("list", { name: "Yanıtlar" }).getByTestId("comment").first();
    await expect(replyNode).toContainText("Kendi yanıtım");

    await replyNode.getByRole("button", { name: /^Düzenle/ }).click();
    await replyNode.getByLabel("Yorumu düzenle").fill("Kendi yanıtım düzeltildi");
    await replyNode.getByRole("button", { name: "Kaydet" }).click();
    await expect(replyNode).toContainText("(düzenlendi)");
    await expect(replyNode).toContainText("Kendi yanıtım düzeltildi");

    await root.getByRole("button", { name: "Sil" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Evet, sil" }).click();
    await expect(section.getByText("[silindi]").first()).toBeVisible();
    await expect(section.getByText("İlk yorumum")).toHaveCount(0);
    await expect(section.getByText("Kendi yanıtım düzeltildi")).toBeVisible();

    await section.getByTestId("comment").filter({ hasText: "Kendi yanıtım düzeltildi" }).last().getByRole("button", { name: "Sil" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Evet, sil" }).click();
    await expect(section.getByText("Kendi yanıtım düzeltildi")).toHaveCount(0);
  });

  test("düzenleme 409 çakışmasında bant gösterir", async ({ page }) => {
    const { question } = await freshQuestion(`Çakışma sorusu ${Date.now().toString(36)}`);
    const student = await studentLogin(page);
    await answered(student, question.id);
    const created = await postComment(student, question.id, "Çakışacak yorum");
    await page.goto(`/sorular/${question.id}`);

    const section = questionComments(page);
    const node = section.locator(`[data-comment-id="${created.id}"]`);
    await node.getByRole("button", { name: /^Düzenle/ }).click();
    await node.getByLabel("Yorumu düzenle").fill("Arayüzden düzenleme");

    const current = (await getComments(student, question.id)).find((item) => item.id === created.id);
    const result = await editCommentApi(student, created.id, "API ile düzenleme", current?.rowVersion ?? "");
    expect(result.status).toBe(200);

    await node.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByTestId("problem-banner")).toContainText("başka biri tarafından değiştirilmiş");
  });

  test("derin dalda Devamını göster ve yorum dizisi sayfası", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Derin sorusu ${Date.now().toString(36)}`);
    const student = await studentLogin(page);
    await answered(student, question.id);
    const other = await activeUser("ogrenci", "derin");
    await answered(other, question.id, 1);

    const root = await postComment(student, question.id, "Kök yorum");
    let parent = root.id;
    const chain: number[] = [root.id];
    for (let level = 1; level <= w.settings.yorumMaxDerinlik; level += 1) {
      const author = level % 2 === 0 ? student : other;
      try {
        const next = await postComment(author, question.id, `Seviye ${level} yanıtı`, parent);
        parent = next.id;
        chain.push(next.id);
      } catch {
        break;
      }
    }
    expect(chain.length).toBeGreaterThan(w.settings.yorumGorunurDerinlik);

    await page.goto(`/sorular/${question.id}`);
    const more = page.getByRole("link", { name: /Devamını göster \(\d+ yanıt\)/ }).first();
    await expect(more).toBeVisible();
    await more.click();
    await expect(page).toHaveURL(/\/yorumlar\/\d+/);
    await expect(page.getByRole("navigation", { name: "Yorum zinciri" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Soruya dön" })).toBeVisible();
    await expect(page.getByTestId("comment").first()).toBeVisible();
    await expect(page.getByRole("list", { name: "Yanıtlar" }).first()).toBeVisible();
  });

  test("yorum ve çözüm metnindeki HTML ile tehlikeli komutlar düz metin kalır", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`XSS sorusu ${Date.now().toString(36)}`);
    const student = await studentLogin(page);
    await answered(student, question.id, 2, `${PAYLOAD} ${validExplanation(w.settings.aciklamaMinKarakter)}`);
    await postComment(student, question.id, PAYLOAD);

    await page.goto(`/sorular/${question.id}`);
    await expect(page.getByTestId("solution").first()).toContainText("<img src=x onerror=window.__xss=1>");
    await expect(questionComments(page).getByTestId("comment-body").first()).toContainText("<img src=x onerror=window.__xss=1>");
    await expect(page.locator("img[src='x']")).toHaveCount(0);
    await expect(page.locator("a[href^='javascript']")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test("yorum şikâyeti dialogu sayaçla çalışır", async ({ page }) => {
    const { question } = await freshQuestion(`Yorum şikâyet ${Date.now().toString(36)}`);
    const author = await activeUser("ogrenci", "yazar");
    await answered(author, question.id, 2);
    await postComment(author, question.id, "Şikâyet edilecek yorum");
    const student = await studentLogin(page);
    await answered(student, question.id, 1);

    await page.goto(`/sorular/${question.id}`);
    const node = questionComments(page).getByTestId("comment").filter({ hasText: "Şikâyet edilecek yorum" });
    await node.getByRole("button", { name: "Şikâyet et" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Neden")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Şikâyet et" })).toBeDisabled();
    await dialog.getByLabel("Açıklama").fill("Bu yorum uygunsuz ifadeler içeriyor.");
    await dialog.getByRole("button", { name: "Şikâyet et" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("bildirimler", () => {
  test("yanıt bildirimi zil sayacına düşer, okununca sayaç azalır", async ({ page }) => {
    const { question } = await freshQuestion(`Bildirim sorusu ${Date.now().toString(36)}`);
    const student = await studentLogin(page);
    await answered(student, question.id);
    const mine = await postComment(student, question.id, "Bildirim alacak yorumum");
    const other = await activeUser("ogrenci", "yanitlayan");
    await answered(other, question.id, 1);
    await postComment(other, question.id, "Sana yanıt veriyorum", mine.id);

    await page.goto("/");
    const bell = page.getByRole("link", { name: /Bildirimler, \d+ okunmamış/ });
    await expect(bell).toBeVisible();

    await page.goto("/bildirimler");
    const item = page.getByTestId("notification").filter({ hasText: "Yorumuna yanıt geldi" }).first();
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute("data-read", "false");

    await page.getByRole("button", { name: "Okunmamış" }).click();
    await expect(page.getByTestId("notification").first()).toBeVisible();

    await item.getByRole("link").click();
    await expect(page).toHaveURL(/\/yorumlar\/\d+/);
    await expect(page.getByTestId("comment").first()).toBeVisible();

    await page.goto("/bildirimler");
    await page.getByRole("button", { name: "Tümünü okundu işaretle" }).click();
    await expect(page.getByRole("link", { name: /^Bildirimler$/ })).toBeVisible();
    await page.getByRole("button", { name: "Okunmamış" }).click();
    await expect(page.getByRole("heading", { name: "Okunmamış bildirim yok" })).toBeVisible();
  });
});
