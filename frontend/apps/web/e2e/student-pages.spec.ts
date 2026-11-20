import { answerQuestion } from "./support/student-data";
import { expect, test } from "./support/fixtures";
import { expectClearOfTabBar } from "./support/layout";
import { freshQuestion, studentLogin, validExplanation, world } from "./support/world";

test.describe("liderlik ve profil", () => {
  test("liderlik sekmeleri, sıram kartı ve önceki dönem", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Liderlik sorusu ${Date.now().toString(36)}`);
    const student = await studentLogin(page);
    await answerQuestion(student, question.id, 2, validExplanation(w.settings.aciklamaMinKarakter));

    await page.goto("/liderlik");
    await expect(page.getByRole("heading", { name: "Liderlik" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Haftalık" })).toHaveAttribute("aria-pressed", "true");
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId("my-rank")).toContainText("puan", { timeout: 4000 });
    }).toPass({ timeout: 90_000, intervals: [3000] });
    const mine = page.getByRole("list", { name: "Sıralama" }).locator("[aria-current='true']");
    const outside = page.getByText(/içinde değilsiniz, sıranız/);
    await expect(mine.or(outside).first()).toBeVisible();

    const range = await page.getByTestId("period-range").textContent();
    await page.getByRole("button", { name: "Aylık" }).click();
    await expect(page.getByRole("button", { name: "Aylık" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("my-rank")).toBeVisible();
    await expect(page.getByTestId("period-range")).not.toHaveText(range ?? "");

    await page.getByRole("button", { name: "Önceki Dönem" }).click();
    await expect(page.getByTestId("period-range")).not.toContainText("(Bu Dönem)");
    await expect(page.getByRole("button", { name: "Sonraki Dönem" })).toBeEnabled();
  });

  test("profil istatistikleri çözülen soruları gösterir", async ({ page }) => {
    const first = await freshQuestion(`Profil sorusu A ${Date.now().toString(36)}`, 2);
    const second = await freshQuestion(`Profil sorusu B ${Date.now().toString(36)}`, 2);
    const student = await studentLogin(page);
    const w = await world();
    await answerQuestion(student, first.question.id, 2, validExplanation(w.settings.aciklamaMinKarakter));
    await answerQuestion(student, second.question.id, 1, validExplanation(w.settings.aciklamaMinKarakter));

    await page.goto("/profil");
    const stats = page.getByTestId("profile-stats");
    await expect(stats).toBeVisible();
    await expect(stats.getByText("Genel Başarı")).toBeVisible();
    await expect(stats.getByTestId("lesson-bar").first()).toBeVisible();
    await expect(stats.getByRole("img", { name: new RegExp(`${first.lesson.name}: 2 sorudan 1 doğru, 1 yanlış`) })).toBeVisible();
    await expect(stats.getByText("Katkılarım")).toBeVisible();
    await expect(stats.getByText("Ödev Katılımı")).toBeVisible();
  });
});

test.describe("pano", () => {
  test("öğrenci panosu son soruları, haftalık puanı ve bildirimleri gösterir", async ({ page }) => {
    await freshQuestion(`Pano sorusu ${Date.now().toString(36)}`);
    await studentLogin(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Açık Ödevler" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Son 7 Günün Soruları" })).toBeVisible();
    await expect(page.getByTestId("pool-question").first()).toBeVisible();
    await expect(page.getByTestId("weekly-points")).toBeVisible();
    await expect(page.getByTestId("unread-summary")).toContainText(/bildirim/);
  });
});

test.describe("mobil alt boşluk", () => {
  test("soru detayı, bildirimler ve liderlik alt sekmeyle kesişmez", async ({ page }, testInfo) => {
    const { question } = await freshQuestion(`Boşluk sorusu ${Date.now().toString(36)}`);
    await studentLogin(page);
    await page.goto(`/sorular/${question.id}`);
    await expect(page.getByRole("button", { name: "Cevabı Gönder" })).toBeVisible();
    await expectClearOfTabBar(page, "f3-soru-detay", testInfo.project.name);
    await page.goto("/bildirimler");
    await expect(page.getByRole("heading", { name: "Bildirimler" })).toBeVisible();
    await expectClearOfTabBar(page, "f3-bildirimler", testInfo.project.name);
    await page.goto("/liderlik");
    await expect(page.getByRole("heading", { name: "Liderlik" })).toBeVisible();
    await expectClearOfTabBar(page, "f3-liderlik", testInfo.project.name);
  });
});

test.describe("erişim", () => {
  test("çerezsiz kullanıcı soru adreslerinde girişe gider", async ({ page }) => {
    await page.goto("/sorular/1");
    await expect(page).toHaveURL(/\/giris\?next=%2Fsorular%2F1/);
  });
});
