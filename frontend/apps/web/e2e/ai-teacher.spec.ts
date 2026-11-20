import type { Page } from "@playwright/test";
import { branchTeacher, produceDispute, requestAi, setSettings } from "./support/ai";
import { activateAccount, adminToken, backend, createAccount, VALID_PASSWORD } from "./support/backend";
import { expectNoAxeViolations } from "./support/axe";
import { expect, login, test } from "./support/fixtures";
import { activeUser, answerQuestion, createTextQuestion } from "./support/student-data";
import { validExplanation, world, authorFor } from "./support/world";

interface DisputedList {
  items: { questionId: number; aiSuggestedOption: number | null; correctOption: number; hiddenAiSolutionId: number | null }[];
}

interface QuestionView {
  rowVersion: string | null;
  correctOption: number | null;
  isAnswerDisputed: boolean | null;
  aiSuggestedOption: number | null;
  aiSolutionState: string;
  answerKeyReviewedAt: string | null;
  answerKeyReviewNote: string | null;
}

test.beforeAll(async () => {
  await setSettings({ aiGunlukCozumGlobalLimit: 1000, aiGunlukCozumLimit: 5, aiCozumAktifMi: 1 });
});

async function loginTeacher(page: Page, user: { userName: string; password: string }) {
  await login(page, user.userName, user.password);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
}

async function fetchQuestion(token: string, id: number) {
  const result = await backend<QuestionView>("GET", `/api/questions/${id}`, { token });
  return result.body;
}

test.describe("şüpheli cevap anahtarları", () => {
  test("liste, bildirim bağlantısı, ayrıntı ve şüpheyi kaldırma", async ({ page }) => {
    const dispute = await produceDispute();
    await loginTeacher(page, dispute.teacher);

    await page.goto("/bildirimler");
    const notification = page.getByTestId("notification").filter({ hasText: "Yapay Zekâ C şıkkını doğru buldu" }).first();
    await expect(notification).toBeVisible();
    await expect(notification.getByRole("link").first()).toHaveAttribute("href", /\/ogretmen\/supheli-anahtarlar\/\d+$/);

    await page.goto("/ogretmen/supheli-anahtarlar");
    await expect(page.getByRole("heading", { name: "Şüpheli Cevap Anahtarları" })).toBeVisible();
    const item = page.locator(`[data-testid="disputed-item"][data-question-id="${dispute.questionId}"]`);
    await expect(item).toBeVisible();
    await expect(item.getByTestId("current-key")).toHaveText("B");
    await expect(item.getByTestId("ai-suggestion")).toHaveText("C");
    await expect(item).toContainText("Şüpheli anahtar sorusu");
    await expectNoAxeViolations(page, "supheli-liste");

    await item.getByRole("link", { name: /^İncele/ }).click();
    await expect(page).toHaveURL(new RegExp(`/ogretmen/supheli-anahtarlar/${dispute.questionId}$`));
    await expect(page.getByRole("heading", { name: "Cevap Anahtarı İncelemesi" })).toBeVisible();
    await expect(page.getByTestId("option-B")).toContainText("Mevcut Anahtar");
    await expect(page.getByTestId("option-C")).toContainText("Yapay Zekâ Önerisi");
    await expect(page.getByTestId("hidden-ai-solution")).toContainText("Sahte yapay zekâ çözümü");
    await expect(page.getByTestId("hidden-ai-solution")).toContainText("öğrencilere gösterilmiyor");
    await expectNoAxeViolations(page, "supheli-detay");

    await page.getByLabel("Not (İsteğe Bağlı)").fill("Anahtar kaynakla doğrulandı.");
    await page.getByTestId("dismiss-dispute").click();
    await page.getByRole("dialog").getByRole("button", { name: "Şüpheyi Kaldır" }).click();
    const outcome = page.getByTestId("review-outcome");
    await expect(outcome).toContainText("Şüphe kaldırıldı");
    await expect(outcome).toContainText("Gizli yapay zekâ çözümü silindi");
    await expect(page.getByTestId("dismiss-dispute")).toHaveCount(0);

    const reviewed = await fetchQuestion(dispute.teacher.token, dispute.questionId);
    expect(reviewed.isAnswerDisputed).toBe(false);
    expect(reviewed.correctOption).toBe(2);
    expect(reviewed.answerKeyReviewedAt).not.toBeNull();
    expect(reviewed.answerKeyReviewNote).toBe("Anahtar kaynakla doğrulandı.");
    await expect(page.getByTestId("review-info")).toContainText("Anahtar kaynakla doğrulandı.");

    await page.goto("/ogretmen/supheli-anahtarlar");
    await expect(page.getByRole("heading", { name: "Şüpheli Cevap Anahtarları" })).toBeVisible();
    await expect(page.locator(`[data-testid="disputed-item"][data-question-id="${dispute.questionId}"]`)).toHaveCount(0);
  });

  test("anahtarı yapay zekâ şıkkına çevirmek puanı düzeltir ve çözümü öğrenciye açar", async ({ page }) => {
    const dispute = await produceDispute();
    const w = await world();
    const student = await activeUser("ogrenci", "ogrenci");
    await answerQuestion(student, dispute.questionId, dispute.aiOption, validExplanation(w.settings.aciklamaMinKarakter));

    await loginTeacher(page, dispute.teacher);
    await page.goto(`/ogretmen/supheli-anahtarlar/${dispute.questionId}`);
    await expect(page.getByTestId("change-key")).toHaveText("Anahtarı C Yap");

    await page.getByTestId("change-key").click();
    await page.getByRole("dialog").getByRole("button", { name: "Anahtarı Değiştir" }).click();
    const outcome = page.getByTestId("review-outcome");
    await expect(outcome).toContainText("Cevap anahtarı C şıkkına çevrildi");
    await expect(outcome).toContainText("Doğru Olan: 1");

    const afterKey = await fetchQuestion(student.token, dispute.questionId);
    expect(afterKey.correctOption).toBe(dispute.aiOption);
    expect(afterKey.aiSolutionState).toBe("available");

    const solutions = await backend<{ items: { type: string; text: string | null; isHidden: boolean }[] }>("GET", `/api/questions/${dispute.questionId}/solutions`, {
      token: student.token,
    });
    const ai = solutions.body.items.find((item) => item.type === "ai");
    expect(ai?.isHidden).toBe(false);
    expect(ai?.text).toContain("Sahte yapay zekâ çözümü");

    const teacherView = await fetchQuestion(dispute.teacher.token, dispute.questionId);
    expect(teacherView.answerKeyReviewedAt).not.toBeNull();
  });

  test("anahtarı farklı şıkka çevirmek yapay zekâ çözümünü siler", async ({ page }) => {
    const dispute = await produceDispute();
    await loginTeacher(page, dispute.teacher);
    await page.goto(`/ogretmen/supheli-anahtarlar/${dispute.questionId}`);
    await expect(page.getByTestId("change-key")).toBeVisible();

    await page.getByRole("radio", { name: /^A şıkkı/ }).click();
    await expect(page.getByTestId("change-key")).toHaveText("Anahtarı A Yap");
    await page.getByLabel("Not (İsteğe Bağlı)").fill("Kaynak kitaba göre doğru cevap A.");
    await page.getByTestId("change-key").click();
    await expect(page.getByRole("dialog")).toContainText("Yapay zekâ çözümü silinir");
    await page.getByRole("dialog").getByRole("button", { name: "Anahtarı Değiştir" }).click();
    await expect(page.getByTestId("review-outcome")).toContainText("Cevap anahtarı A şıkkına çevrildi");

    const view = await fetchQuestion(dispute.teacher.token, dispute.questionId);
    expect(view.correctOption).toBe(1);
    expect(view.answerKeyReviewedAt).not.toBeNull();
    await expect(page.getByTestId("review-info")).toContainText("Kaynak kitaba göre doğru cevap A.");
  });

  test("rowVersion çakışması 409 bandı gösterir ve güncel hali çeker", async ({ page }) => {
    const dispute = await produceDispute();
    await loginTeacher(page, dispute.teacher);
    await page.goto(`/ogretmen/supheli-anahtarlar/${dispute.questionId}`);
    await expect(page.getByTestId("change-key")).toBeVisible();

    const current = await fetchQuestion(dispute.teacher.token, dispute.questionId);
    const changed = await backend("PUT", `/api/questions/${dispute.questionId}/correct-option`, {
      token: dispute.teacher.token,
      body: { correctOption: 4, rowVersion: current.rowVersion, note: null },
    });
    expect(changed.status).toBe(200);

    await page.getByTestId("change-key").click();
    await page.getByRole("dialog").getByRole("button", { name: "Anahtarı Değiştir" }).click();
    const banner = page.getByTestId("problem-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("başka biri tarafından değiştirilmiş");
    await expect(page.getByTestId("option-D")).toContainText("Mevcut Anahtar");
  });

  test("branşı olmayan öğretmen listeyi göremez, öğrenci erişemez, müdür tümünü görür", async ({ page }) => {
    const dispute = await produceDispute();
    const w = await world();
    const otherLesson = w.lessons.find((lesson) => lesson.id !== dispute.lessonId)!;
    const outsider = await branchTeacher(otherLesson.id);

    const outsiderList = await backend<DisputedList>("GET", "/api/admin/disputed-questions", { token: outsider.token });
    expect(outsiderList.status).toBe(200);
    expect(outsiderList.body.items.some((entry) => entry.questionId === dispute.questionId)).toBe(false);

    const own = await backend<DisputedList>("GET", "/api/admin/disputed-questions", { token: dispute.teacher.token });
    const found = own.body.items.find((entry) => entry.questionId === dispute.questionId);
    expect(found?.aiSuggestedOption).toBe(dispute.aiOption);
    expect(found?.hiddenAiSolutionId).not.toBeNull();

    const view = await fetchQuestion(outsider.token, dispute.questionId);
    const refused = await backend("POST", `/api/questions/${dispute.questionId}/answer-dispute/dismiss`, {
      token: outsider.token,
      body: { rowVersion: view.rowVersion, note: null },
    });
    expect(refused.status).toBe(403);

    const student = await activeUser("ogrenci", "ogrenci");
    const studentList = await backend("GET", "/api/admin/disputed-questions", { token: student.token });
    expect(studentList.status).toBe(403);
    await login(page, student.userName, student.password);
    await page.goto("/ogretmen/supheli-anahtarlar");
    await expect(page).toHaveURL(/localhost:\d+\/$/);

    const mudurView = await backend<DisputedList>("GET", "/api/admin/disputed-questions?pageSize=50", { token: await adminToken() });
    expect(mudurView.status).toBe(200);
  });

  test("müdür tüm dersleri görür ve ders filtresi uygular", async ({ page }) => {
    const dispute = await produceDispute();
    const mudur = await createAccount("mudur");
    await activateAccount(mudur);
    await login(page, mudur.userName, VALID_PASSWORD);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();

    await page.goto("/ogretmen/supheli-anahtarlar");
    await expect(page.getByLabel("Ders")).toBeVisible();
    await expect(page.locator(`[data-testid="disputed-item"][data-question-id="${dispute.questionId}"]`)).toBeVisible();

    await page.getByLabel("Ders").selectOption(String(dispute.lessonId));
    await expect(page.locator(`[data-testid="disputed-item"][data-question-id="${dispute.questionId}"]`)).toBeVisible();

    const w = await world();
    const other = w.lessons.find((lesson) => lesson.id !== dispute.lessonId)!;
    await page.getByLabel("Ders").selectOption(String(other.id));
    await expect(page.locator(`[data-testid="disputed-item"][data-question-id="${dispute.questionId}"]`)).toHaveCount(0);
    await expectNoAxeViolations(page, "supheli-mudur");
  });
});

test.describe("branş yetkisi", () => {
  test("başka branşlı öğretmen karar düğmelerini ve AI önerisini görmez, branş öğretmeni ve müdür görür", async ({ page, browser }) => {
    const dispute = await produceDispute();
    const w = await world();
    const otherLesson = w.lessons.find((lesson) => lesson.id !== dispute.lessonId)!;
    const outsider = await branchTeacher(otherLesson.id);

    await loginTeacher(page, outsider);
    await page.goto(`/ogretmen/supheli-anahtarlar/${dispute.questionId}`);
    await expect(page.getByTestId("not-my-branch")).toContainText("karar branş öğretmenine ait");
    await expect(page.getByTestId("change-key")).toHaveCount(0);
    await expect(page.getByTestId("dismiss-dispute")).toHaveCount(0);
    await expect(page.getByTestId("hidden-ai-solution")).toHaveCount(0);
    await expect(page.getByTestId("option-C")).not.toContainText("Yapay Zekâ Önerisi");
    await page.goto("/ogretmen/supheli-anahtarlar");
    await expect(page.getByTestId("branch-hint")).toContainText(`Branşınız: ${otherLesson.name}`);
    await expectNoAxeViolations(page, "supheli-baska-brans");

    const ownContext = await browser.newContext();
    const ownPage = await ownContext.newPage();
    try {
      await loginTeacher(ownPage, dispute.teacher);
      await ownPage.goto(`/ogretmen/supheli-anahtarlar/${dispute.questionId}`);
      await expect(ownPage.getByTestId("change-key")).toBeVisible();
      await expect(ownPage.getByTestId("option-C")).toContainText("Yapay Zekâ Önerisi");
      await expect(ownPage.getByTestId("not-my-branch")).toHaveCount(0);
    } finally {
      await ownContext.close();
    }

    const mudur = await createAccount("mudur");
    await activateAccount(mudur);
    const mudurContext = await browser.newContext();
    const mudurPage = await mudurContext.newPage();
    try {
      await login(mudurPage, mudur.userName, VALID_PASSWORD);
      await mudurPage.goto(`/ogretmen/supheli-anahtarlar/${dispute.questionId}`);
      await expect(mudurPage.getByTestId("change-key")).toBeVisible();
      await expect(mudurPage.getByTestId("option-C")).toContainText("Yapay Zekâ Önerisi");
    } finally {
      await mudurContext.close();
    }

    const outsiderView = await fetchQuestion(outsider.token, dispute.questionId);
    expect(outsiderView.aiSuggestedOption).toBeNull();
  });
});

test.describe("öğretmen yapay zekâ isteği", () => {
  test("moderatör kişisel limite takılmaz ve yanıtta kota yoktur", async () => {
    const w = await world();
    const teacher = await branchTeacher(w.lessons[0]!.id);
    const creator = await authorFor(w.lessons[0]!.id);
    const question = await createTextQuestion(creator, w.lessons[0]!.id, `Moderatör isteği ${Date.now().toString(36)}: Hangisi doğrudur?`, 2);
    const result = await requestAi(teacher, question.id);
    expect([200, 201]).toContain(result.status);
    expect(result.body?.quota ?? null).toBeNull();
  });
});
