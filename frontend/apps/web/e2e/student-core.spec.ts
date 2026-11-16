import { answerQuestion, LONG_TEXT, reportSolution, rejectPendingReports, uploadQuestionImage } from "./support/student-data";
import { expect, test } from "./support/fixtures";
import { freshQuestion, studentLogin, validExplanation, world } from "./support/world";
import { activeUser } from "./support/student-data";

test.describe("soru listesi", () => {
  test("filtreler URL'de tutulur, geri tuşu ve yenileme çalışır", async ({ page }) => {
    const w = await world();
    const first = await freshQuestion(`Liste sorusu A ${Date.now().toString(36)}`, 1, 0);
    const second = await freshQuestion(`Liste sorusu B ${Date.now().toString(36)}`, 1, 1);
    await studentLogin(page);

    await page.goto("/sorular");
    await expect(page.getByRole("heading", { name: "Soru Çöz" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Çözmediklerim" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("pool-question").first()).toBeVisible();

    await page.getByLabel("Ders").selectOption(String(first.lesson.id));
    await expect(page).toHaveURL(new RegExp(`ders=${first.lesson.id}`));
    await expect(page.getByTestId("pool-question").first()).toBeVisible();

    await page.getByRole("button", { name: "Tümü" }).click();
    await expect(page).toHaveURL(/durum=tumu/);

    await page.reload();
    await expect(page.getByLabel("Ders")).toHaveValue(String(first.lesson.id));
    await expect(page.getByRole("button", { name: "Tümü" })).toHaveAttribute("aria-pressed", "true");

    await page.goBack();
    await expect(page).not.toHaveURL(/durum=tumu/);
    await expect(page).toHaveURL(new RegExp(`ders=${first.lesson.id}`));

    await page.getByLabel("Ders").selectOption(String(second.lesson.id));
    await expect(page.getByLabel("Konu")).toBeEnabled();
    expect(w.lessons.length).toBeGreaterThan(1);
  });

  test("kart önizlemesi formülü KaTeX ile gösterir, yarım formül hata vermez", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const closed = await freshQuestion(`Formül ${stamp}: $$\\frac{1}{2}$$ ve $x^2$ değeri kaçtır?`);
    const cut = await freshQuestion(`Yarım ${stamp} ${"uzun ".repeat(25)}$\\frac{1}{2} + x^2 + 3 değeri`);
    await studentLogin(page);
    await page.goto("/sorular?durum=tumu");

    const closedCard = page.getByTestId("pool-question").filter({ hasText: `Formül ${stamp}` });
    await expect(closedCard.locator(".katex").first()).toBeVisible();
    await expect(closedCard.locator(".katex-display")).toHaveCount(0);
    await expect(closedCard.locator(".katex-error")).toHaveCount(0);

    const cutCard = page.getByTestId("pool-question").filter({ hasText: `Yarım ${stamp}` });
    await expect(cutCard).toBeVisible();
    await expect(cutCard.locator(".katex-error")).toHaveCount(0);
    const box = await cutCard.boundingBox();
    const scroll = await cutCard.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(scroll).toBeLessThanOrEqual(1);
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(closed.question.id).not.toBe(cut.question.id);
  });

  test("çözülen soru çözdüklerimde görünür, çözmediklerimden düşer", async ({ page }) => {
    const { question } = await freshQuestion(`Durum sorusu ${Date.now().toString(36)}`);
    const student = await studentLogin(page);
    const w = await world();
    await answerQuestion(student, question.id, 2, validExplanation(w.settings.aciklamaMinKarakter));

    await page.goto("/sorular?durum=cozuldu");
    await expect(page.getByTestId("pool-question").filter({ hasText: question.text })).toBeVisible();
    await expect(page.getByTestId("pool-question").filter({ hasText: question.text })).toContainText("Doğru");

    await page.goto("/sorular");
    await expect(page.getByTestId("pool-question").filter({ hasText: question.text })).toHaveCount(0);
  });

  test("API cevaplanmamış soruda doğru şıkkı sızdırmaz", async ({ page }) => {
    const { question } = await freshQuestion(`Sızıntı sorusu ${Date.now().toString(36)}`);
    await studentLogin(page);
    const listResponse = await page.request.get("/api/questions?answered=false&pageSize=50");
    const list = (await listResponse.json()) as { items: { id: number; correctOption: number | null; commentCount: number | null }[] };
    const item = list.items.find((entry) => entry.id === question.id);
    expect(item).toBeDefined();
    expect(item?.correctOption).toBeNull();
    expect(item?.commentCount).toBeNull();

    const detailResponse = await page.request.get(`/api/questions/${question.id}`);
    const detail = (await detailResponse.json()) as { correctOption: number | null; permissions: { canSeeDiscussion: boolean } };
    expect(detail.correctOption).toBeNull();
    expect(detail.permissions.canSeeDiscussion).toBe(false);
  });
});

test.describe("soru detayı ve cevaplama", () => {
  test("cevaplamadan önce tartışma kilitli, kısa açıklama reddedilir, doğru cevapta puan verilir", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Cevap sorusu ${Date.now().toString(36)}`, 3);
    await studentLogin(page);
    await page.goto(`/sorular/${question.id}`);

    await expect(page.getByRole("heading", { name: "Tartışma kilitli" })).toBeVisible();
    await expect(page.getByText("Yorumları ve çözümleri görmek için önce soruyu cevapla.")).toBeVisible();
    await expect(page.getByText(question.text)).toBeVisible();

    const submit = page.getByRole("button", { name: "Cevabı Gönder" });
    await expect(submit).toBeDisabled();
    await page.getByRole("radio", { name: "C şıkkı" }).click();
    await page.getByLabel(/^Çözümünü anlat/).fill("kısa");
    await expect(submit).toBeDisabled();
    await expect(page.getByTestId("answer-counter")).toContainText(`en az ${w.settings.aciklamaMinKarakter}`);

    await page.getByLabel(/^Çözümünü anlat/).fill(validExplanation(w.settings.aciklamaMinKarakter));
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByTestId("answer-result")).toContainText("Doğru cevap!");
    await expect(page.getByTestId("points-earned")).toContainText(/Kazandığın puan: \d+/);
    await expect(page.getByRole("heading", { name: "Çözümler" })).toBeVisible();
    await expect(page.getByTestId("solution").first()).toContainText("Sen");
  });

  test("yanlış cevapta doğru şık gösterilir", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Yanlış sorusu ${Date.now().toString(36)}`, 4);
    await studentLogin(page);
    await page.goto(`/sorular/${question.id}`);
    await page.getByRole("radio", { name: "A şıkkı" }).click();
    await page.getByLabel(/^Çözümünü anlat/).fill(validExplanation(w.settings.aciklamaMinKarakter));
    await page.getByRole("button", { name: "Cevabı Gönder" }).click();
    await expect(page.getByTestId("answer-result")).toContainText("Bu sefer olmadı");
    await expect(page.getByTestId("answer-result")).toContainText("Doğru cevap: D");
  });

  test("taslak sayfa yenilenince korunur", async ({ page }) => {
    const { question } = await freshQuestion(`Taslak sorusu ${Date.now().toString(36)}`);
    await studentLogin(page);
    await page.goto(`/sorular/${question.id}`);
    await page.getByLabel(/^Çözümünü anlat/).fill("Taslak olarak yazdığım yarım açıklama");
    await page.reload();
    await expect(page.getByLabel(/^Çözümünü anlat/)).toHaveValue("Taslak olarak yazdığım yarım açıklama");
  });

  test("beğeni optimistic çalışır ve kalıcıdır", async ({ page }) => {
    const { question } = await freshQuestion(`Beğeni sorusu ${Date.now().toString(36)}`);
    await studentLogin(page);
    await page.goto(`/sorular/${question.id}`);
    const like = page.getByTestId("like-button");
    await expect(page.getByTestId("like-count")).toHaveText("0");
    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("like-count")).toHaveText("1");
    await page.reload();
    await expect(page.getByTestId("like-button")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("like-button").click();
    await expect(page.getByTestId("like-count")).toHaveText("0");
  });

  test("KaTeX formülü işlenir, HTML ve tehlikeli komutlar düz metin kalır", async ({ page }) => {
    const payload = "<img src=x onerror=window.__xss=1> $\\href{javascript:window.__xss=3}{tikla}$";
    const { question } = await freshQuestion(`Formül $x^2+1$ ve $$\\frac{a}{b}$$ sorusu ${payload}`);
    await studentLogin(page);
    await page.goto(`/sorular/${question.id}`);
    await expect(page.locator(".katex").first()).toBeVisible();
    await expect(page.locator("[data-math='display'] .katex-display, [data-math='display'] .katex").first()).toBeVisible();
    await expect(page.locator("img[src='x']")).toHaveCount(0);
    await expect(page.locator("a[href^='javascript']")).toHaveCount(0);
    await expect(page.getByText("<img src=x onerror=window.__xss=1>")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });
});

test.describe("çözümler", () => {
  test("öğrenci çözümünü düzenler ve düzenlendi bilgisi görünür", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Düzenleme sorusu ${Date.now().toString(36)}`);
    const student = await studentLogin(page);
    await answerQuestion(student, question.id, 2, validExplanation(w.settings.aciklamaMinKarakter));

    await page.goto(`/sorular/${question.id}`);
    const mine = page.getByTestId("solution").filter({ hasText: "(Sen)" });
    await expect(mine).toBeVisible();
    await expect(mine.getByTestId("solution-edited")).toHaveCount(0);
    await mine.getByTestId("solution-edit").click();
    const edited = `Düzenlenmiş çözüm: ${validExplanation(w.settings.aciklamaMinKarakter)}`;
    await page.getByLabel("Çözümü düzenle").fill(edited);
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(mine.getByTestId("solution-edited")).toBeVisible();
    await expect(mine).toContainText("Düzenlenmiş çözüm:");
  });

  test("çözüm metni düzenlenince görsel korunur", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Görsel koruma ${Date.now().toString(36)}`);
    const student = await studentLogin(page);
    const imageId = await uploadQuestionImage(student, "solutionImage");
    await answerQuestion(student, question.id, 2, validExplanation(w.settings.aciklamaMinKarakter), imageId);

    await page.goto(`/sorular/${question.id}`);
    const mine = page.getByTestId("solution").filter({ hasText: "(Sen)" });
    await expect(mine.locator("img[alt='Çözüm görseli']")).toBeVisible();
    await mine.getByTestId("solution-edit").click();
    await page.getByLabel("Çözümü düzenle").fill(`Görsel kalmalı: ${validExplanation(w.settings.aciklamaMinKarakter)}`);
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(mine.getByTestId("solution-edited")).toBeVisible();

    const list = (await (await page.request.get(`/api/questions/${question.id}/solutions`)).json()) as {
      items: { isMine: boolean; imageFileId: number | null; image: unknown }[];
    };
    const own = list.items.find((item) => item.isMine);
    expect(own?.imageFileId).toBe(imageId);
    expect(own?.image).toBeTruthy();
    await expect(mine.locator("img[alt='Çözüm görseli']")).toBeVisible();
  });

  test("şikâyet edilen çözüm düzenlenemez, öğretmen reddedince düzenleme açılır", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Şikâyet sorusu ${Date.now().toString(36)}`);
    const owner = await studentLogin(page);
    const answer = await answerQuestion(owner, question.id, 2, validExplanation(w.settings.aciklamaMinKarakter));

    const other = await activeUser("ogrenci", "sikayetci");
    await answerQuestion(other, question.id, 1, LONG_TEXT.repeat(2));
    const report = await reportSolution(other, answer.solutionId, "inappropriate", "Bu çözüm uygunsuz görünüyor, kontrol edilsin.");
    expect(report.status).toBe(201);

    await page.goto(`/sorular/${question.id}`);
    const mine = page.getByTestId("solution").filter({ hasText: "(Sen)" });
    await expect(mine.getByTestId("solution-edit")).toBeDisabled();
    await expect(mine.getByTestId("solution-locked")).toContainText("incelenen bir şikâyet var");

    expect(await rejectPendingReports(w.teacher, answer.solutionId)).toBe(1);
    await page.reload();
    await expect(page.getByTestId("solution").filter({ hasText: "(Sen)" }).getByTestId("solution-edit")).toBeEnabled();
  });

  test("çözümü arayüzden şikâyet etmek sayaçlı formla çalışır", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Arayüz şikâyet ${Date.now().toString(36)}`);
    const author = await activeUser("ogrenci", "yazar");
    await answerQuestion(author, question.id, 2, validExplanation(w.settings.aciklamaMinKarakter));
    const student = await studentLogin(page);
    await answerQuestion(student, question.id, 1, validExplanation(w.settings.aciklamaMinKarakter));

    await page.goto(`/sorular/${question.id}`);
    const others = page.getByTestId("solution").filter({ hasNotText: "(Sen)" });
    await others.first().getByRole("button", { name: "Şikâyet et" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("report-counter")).toContainText(`en az ${w.settings.sikayetMinKarakter}`);
    const submit = dialog.getByRole("button", { name: "Şikâyet et" });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel("Açıklama").fill("Bu çözüm uygun değil, lütfen incelenmeli.");
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
