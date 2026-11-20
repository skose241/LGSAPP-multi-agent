import { answeredQuestion, produceDispute, requestAi, setSettings } from "./support/ai";
import { backend } from "./support/backend";
import { expectNoAxeViolations } from "./support/axe";
import { expect, test } from "./support/fixtures";
import { answerQuestion } from "./support/student-data";
import { studentLogin, validExplanation, world, authorFor } from "./support/world";

test.beforeAll(async () => {
  await setSettings({ aiGunlukCozumGlobalLimit: 1000, aiGunlukCozumLimit: 5, aiCozumAktifMi: 1 });
});

async function quotaOf(token: string) {
  const result = await backend<{ enabled: boolean; dailyLimit: number | null; usedToday: number; remainingToday: number | null }>("GET", "/api/ai/quota", { token });
  return result.body;
}

test.describe("öğrenci yapay zekâ çözümü", () => {
  test("istek: bekleme durumu, çözüm ve kota düşüşü", async ({ page }) => {
    await produceDispute();
    const w = await world();
    const creator = await authorFor(w.lessons[0]!.id);
    const student = await studentLogin(page);
    const question = await answeredQuestion(student, creator, w.lessons[0]!.id, 2, "Yapay zekâ isteği");

    await page.route("**/api/questions/*/solutions/ai", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.goto(`/sorular/${question.id}`);
    await expect(page.getByTestId("ai-quota")).toHaveText("Bugün Kalan Hakkınız: 5 / 5");
    await expectNoAxeViolations(page, "ai-none");

    await page.getByTestId("ai-request").click();
    await expect(page.getByText("Çözüm Hazırlanıyor")).toBeVisible();
    await expect(page.getByTestId("ai-solution")).toContainText("Sahte yapay zekâ çözümü");
    await expect(page.getByTestId("ai-request")).toHaveCount(0);

    const quota = await quotaOf(student.token);
    expect(quota.remainingToday).toBe(4);
    expect(quota.usedToday).toBe(1);

    await page.reload();
    await expect(page.getByTestId("ai-solution")).toContainText("Doğru seçenek");
    await expectNoAxeViolations(page, "ai-available");
  });

  test("kişisel limit dolunca 429 mesajı gösterilir ve istek kapanır", async ({ page }) => {
    test.setTimeout(240_000);
    await produceDispute();
    const w = await world();
    const creator = await authorFor(w.lessons[0]!.id);
    const lessonId = w.lessons[0]!.id;
    const student = await studentLogin(page);

    const first = await answeredQuestion(student, creator, lessonId, 2, "Limit birinci");
    await page.goto(`/sorular/${first.id}`);
    await expect(page.getByTestId("ai-quota")).toHaveText("Bugün Kalan Hakkınız: 5 / 5");
    await page.getByTestId("ai-request").click();
    await expect(page.getByTestId("ai-solution")).toBeVisible();

    for (let index = 0; index < 3; index += 1) {
      const extra = await answeredQuestion(student, creator, lessonId, 2, `Limit ek ${index}`);
      const result = await requestAi(student, extra.id);
      expect([200, 201]).toContain(result.status);
    }
    expect((await quotaOf(student.token)).remainingToday).toBe(1);

    const target = await answeredQuestion(student, creator, lessonId, 2, "Limit hedef");
    const racer = await answeredQuestion(student, creator, lessonId, 2, "Limit yarışçı");
    await page.goto(`/sorular/${target.id}`);
    await expect(page.getByTestId("ai-quota")).toHaveText("Bugün Kalan Hakkınız: 1 / 5");

    const last = await requestAi(student, racer.id);
    expect([200, 201]).toContain(last.status);

    const notice = page.getByTestId("ai-notice");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await page.getByTestId("ai-request").click();
      await expect(notice).toBeVisible();
      if ((await notice.getAttribute("data-kind")) !== "rateLimit") break;
      await expect(page.getByTestId("ai-request")).toBeEnabled({ timeout: 70_000 });
    }
    await expect(notice).toHaveAttribute("data-kind", "dailyLimit");
    await expect(notice).toContainText("hakkınız doldu");
    await expect(page.getByTestId("ai-request")).toHaveCount(0);
    await expect(page.getByTestId("ai-quota")).toContainText("Bugünkü hakkınız doldu");
    await expectNoAxeViolations(page, "ai-limit");

    await page.reload();
    await expect(page.getByTestId("ai-quota")).toContainText("Bugünkü hakkınız doldu");
    await expect(page.getByTestId("ai-request")).toHaveCount(0);

    const refused = await requestAi(student, target.id);
    expect(refused.status).toBe(429);
  });

  test("aynı soruya eşzamanlı istekler tek çözüm üretir ve hakkı bir kez düşer", async ({ page }) => {
    await produceDispute();
    const w = await world();
    const creator = await authorFor(w.lessons[0]!.id);
    const student = await studentLogin(page);
    const question = await answeredQuestion(student, creator, w.lessons[0]!.id, 2, "Eşzamanlı");

    const results = await Promise.all([requestAi(student, question.id), requestAi(student, question.id), requestAi(student, question.id)]);
    for (const result of results) expect([200, 201]).toContain(result.status);
    expect(results.filter((result) => result.status === 201).length).toBeLessThanOrEqual(1);

    const solutions = await backend<{ items: { type: string }[] }>("GET", `/api/questions/${question.id}/solutions`, { token: student.token });
    expect(solutions.body.items.filter((item) => item.type === "ai").length).toBe(1);
    expect((await quotaOf(student.token)).usedToday).toBe(1);
  });

  test("dakikalık sınır ve sağlayıcı hatasında geri sayım çalışır", async ({ page }) => {
    const w = await world();
    const creator = await authorFor(w.lessons[0]!.id);
    const student = await studentLogin(page);
    const question = await answeredQuestion(student, creator, w.lessons[0]!.id, 2, "Geri sayım");

    let mode: "rate" | "down" = "rate";
    await page.route("**/api/questions/*/solutions/ai", async (route) => {
      if (mode === "rate") {
        await route.fulfill({
          status: 429,
          headers: { "retry-after": "4" },
          contentType: "application/problem+json",
          body: JSON.stringify({ title: "Çok fazla istek gönderildi.", detail: "Lütfen bir süre bekleyip tekrar deneyin.", status: 429 }),
        });
        return;
      }
      await route.fulfill({
        status: 503,
        headers: { "retry-after": "3" },
        contentType: "application/problem+json",
        body: JSON.stringify({ title: "Hizmet kullanılamıyor", detail: "Yapay zekâ şu anda yanıt veremiyor. Lütfen biraz sonra tekrar deneyin.", status: 503 }),
      });
    });

    await page.goto(`/sorular/${question.id}`);
    await page.getByTestId("ai-request").click();
    const notice = page.getByTestId("ai-notice");
    await expect(notice).toHaveAttribute("data-kind", "rateLimit");
    await expect(notice).toContainText("saniye sonra tekrar deneyebilirsiniz");
    await expect(page.getByTestId("ai-request")).toBeDisabled();
    await expect(page.getByTestId("ai-request")).toBeEnabled({ timeout: 10_000 });
    await expect(notice).toContainText("Şimdi tekrar deneyebilirsiniz");

    mode = "down";
    await page.getByTestId("ai-request").click();
    await expect(notice).toHaveAttribute("data-kind", "providerDown");
    await expect(notice).toContainText("Bu denemede hakkınız düşmedi");
    await expect(page.getByTestId("ai-request")).toBeDisabled();
    await expect(page.getByTestId("ai-request")).toBeEnabled({ timeout: 10_000 });
    expect((await quotaOf(student.token)).usedToday).toBe(0);
  });

  test("durum metinleri aiSolutionState değerine göre gösterilir, bilinmeyen değer none sayılır", async ({ page }) => {
    const w = await world();
    const creator = await authorFor(w.lessons[0]!.id);
    const student = await studentLogin(page);
    const question = await answeredQuestion(student, creator, w.lessons[0]!.id, 2, "Durum metni");

    let state = "underReview";
    await page.route(new RegExp(`/api/questions/${question.id}$`), async (route) => {
      const response = await route.fetch();
      const json = (await response.json()) as Record<string, unknown>;
      json.aiSolutionState = state;
      await route.fulfill({ response, json });
    });

    const expectations: [string, RegExp][] = [
      ["underReview", /öğretmen incelemesinde/],
      ["removed", /kaldırıldı/],
      ["unavailable", /üretilemiyor/],
      ["unreadable", /net okunamadığı/],
    ];

    for (const [value, pattern] of expectations) {
      state = value;
      await page.goto(`/sorular/${question.id}`);
      const panel = page.getByTestId(`ai-state-${value}`);
      await expect(panel).toBeVisible();
      await expect(panel).toContainText(pattern);
      await expect(page.getByTestId("ai-request")).toHaveCount(0);
    }
    await expectNoAxeViolations(page, "ai-unreadable");

    state = "yeniBirDeger";
    await page.goto(`/sorular/${question.id}`);
    await expect(page.getByTestId("ai-request")).toBeVisible();
  });

  test("uyuşmazlıkta öğrenci yapay zekâ çözümünü ve önerilen şıkkı görmez", async ({ page }) => {
    const dispute = await produceDispute();
    const student = await studentLogin(page);
    const w = await world();
    await answerQuestion(student, dispute.questionId, 2, validExplanation(w.settings.aciklamaMinKarakter));

    await page.goto(`/sorular/${dispute.questionId}`);
    const panel = page.getByTestId("ai-state-underReview");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("öğretmen incelemesinde");
    await expectNoAxeViolations(page, "ai-under-review");

    const detail = await backend<{ aiSuggestedOption: number | null; isAnswerDisputed: boolean | null; aiSolutionState: string }>(
      "GET",
      `/api/questions/${dispute.questionId}`,
      { token: student.token },
    );
    expect(detail.body.aiSuggestedOption).toBeNull();
    expect(detail.body.isAnswerDisputed ?? false).toBe(false);
    expect(detail.body.aiSolutionState).toBe("underReview");

    const solutions = await backend<{ items: { type: string }[] }>("GET", `/api/questions/${dispute.questionId}/solutions`, { token: student.token });
    expect(solutions.body.items.some((item) => item.type === "ai")).toBe(false);

    const again = await requestAi(student, dispute.questionId);
    expect(again.status).toBe(200);
    expect(again.body?.status).toBe("underReview");
  });
});
