import { addDaysToDateOnly, formatDateOnly, todayInIstanbul } from "@lgs/api";
import type { Page } from "@playwright/test";
import { branchTeacher } from "./support/ai";
import {
  addTextQuestionsApi,
  assignmentDetail,
  clearTopicPlan,
  createDraftAssignment,
  ensureFullWeekSchedule,
  nextWeekdayFrom,
  pngFiles,
  scheduledPoolQuestion,
  setTopicPlan,
} from "./support/assignment-data";
import { expectNoAxeViolations } from "./support/axe";
import { backend } from "./support/backend";
import { expect, login, logoutViaUi, test } from "./support/fixtures";
import { activeUser, answerQuestion, createOpenAssignment } from "./support/student-data";
import { validExplanation, world } from "./support/world";

async function loginAs(page: Page, user: { userName: string; password: string }) {
  await login(page, user.userName, user.password);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
}

function entryFor(page: Page, base: string, userName: string) {
  return page.locator(`[data-testid="${base}-row"][data-user-name="${userName}"], [data-testid="${base}-card"][data-user-name="${userName}"]`).locator("visible=true");
}

async function waitUploaded(page: Page, count: number) {
  await expect(page.locator('[data-testid="composer-card"] [data-testid="upload-status"][data-status="done"]')).toHaveCount(count, { timeout: 120_000 });
}

async function lastLesson() {
  const w = await world();
  return w.lessons[w.lessons.length - 1]!;
}

async function quietLesson() {
  const w = await world();
  return w.lessons[w.lessons.length - 2] ?? w.lessons[w.lessons.length - 1]!;
}

const LATE_END = 6;

test.describe("ödev oluşturma ve yönetim zinciri", () => {
  test("oluştur, 10 fotoğrafla toplu ekle, havuzdan ekle, sırala, düzenle, çıkar, yayınla; öğrenci çözer; öğretmen sonuçları görür", async ({ page }) => {
    test.setTimeout(420_000);
    const w = await world();
    const lesson = await quietLesson();
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const stamp = Date.now().toString(36);
    const title = `Zincir ödevi ${stamp}`;
    const poolA = await scheduledPoolQuestion(teacher, lesson.id, `Havuz A ${stamp}: Hangisi doğrudur?`, addDaysToDateOnly(today, 2));
    const poolB = await scheduledPoolQuestion(teacher, lesson.id, `Havuz B ${stamp}: Hangisi doğrudur?`, addDaysToDateOnly(today, 3));

    await loginAs(page, teacher);
    await page.goto("/ogretmen/odevler/yeni");
    await expect(page.getByRole("heading", { name: "Yeni Ödev", level: 1 })).toBeVisible();
    await expect(page.getByLabel(/^Ders\*?$/)).toBeDisabled();
    await expect(page.getByLabel(/^Ders\*?$/)).toHaveValue(String(lesson.id));
    await page.getByLabel("Başlık", { exact: true }).fill(title);
    await page.getByLabel("Açıklama", { exact: true }).fill("Zincir ödevi açıklaması");
    await page.getByLabel(/^Bitiş Tarihi/).fill(addDaysToDateOnly(today, LATE_END));
    await page.getByTestId("assignment-create").click();
    await expect(page).toHaveURL(/\/ogretmen\/odevler\/\d+$/);
    const id = Number(page.url().split("/").pop());
    await expect(page.getByTestId("assignment-title")).toHaveText(title);
    await expect(page.getByTestId("assignment-state")).toHaveText("Taslak");
    await expect(page.getByTestId("assignment-publish")).toBeDisabled();
    await expect(page.getByTestId("publish-hint")).toContainText("en az bir soru");
    await expectNoAxeViolations(page, "odev-duzenle-bos");

    const input = page.getByTestId("photo-input");
    await expect(input).toHaveAttribute("multiple", "");
    await input.setInputFiles(pngFiles(10));
    await expect(page.getByTestId("composer-card")).toHaveCount(10);
    await waitUploaded(page, 10);
    const cards = page.getByTestId("composer-card");
    for (let index = 0; index < 10; index += 1) {
      await cards.nth(index).getByRole("radio", { name: `${"ABCD"[index % 4]} şıkkı` }).click();
    }
    await page.getByTestId("composer-submit").click();
    await expect(page.getByTestId("assignment-question")).toHaveCount(10, { timeout: 90_000 });
    await expect(page.getByTestId("composer-card").filter({ has: page.locator('[data-phase="created"]') })).toHaveCount(0);
    let detail = await assignmentDetail(teacher, id);
    expect(detail.questions.map((question) => question.correctOption)).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 1, 2]);
    expect(detail.questions.every((question) => question.imageFileId !== null)).toBe(true);

    await page.getByRole("button", { name: "Havuzdan Ekle" }).click();
    const poolPanel = page.getByTestId("pool-panel");
    await expect(poolPanel.getByTestId("pool-item").filter({ hasText: `Havuz A ${stamp}` })).toBeVisible();
    await poolPanel.getByTestId("pool-item").filter({ hasText: `Havuz A ${stamp}` }).getByRole("checkbox").check();
    await poolPanel.getByTestId("pool-item").filter({ hasText: `Havuz B ${stamp}` }).getByRole("checkbox").check();
    await poolPanel.getByTestId("pool-attach").click();
    await expect(page.getByTestId("assignment-question")).toHaveCount(12);
    await expect(poolPanel.getByTestId("pool-item").filter({ hasText: `Havuz A ${stamp}` })).toHaveCount(0);

    const rowB = page.getByTestId("assignment-question").filter({ hasText: `Havuz B ${stamp}` });
    const before = Number(await rowB.getAttribute("data-order"));
    await rowB.getByRole("button", { name: /yukarı taşı/ }).click();
    await expect(rowB).toHaveAttribute("data-order", String(before - 1));
    await expect(page.locator(":focus")).toHaveAttribute("data-move", /-(up|down)$/);
    await expect(page.getByTestId("reorder-status")).toContainText("sıraya taşındı");
    detail = await assignmentDetail(teacher, id);
    expect(detail.questions[before - 2]?.text).toContain(`Havuz B ${stamp}`);
    expect(poolA.id).not.toBe(poolB.id);

    await page.getByRole("button", { name: "Soru 1'i düzenle" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Soruyu Düzenle" })).toBeVisible();
    await dialog.getByRole("radio", { name: "D şıkkı" }).click();
    await dialog.getByTestId("question-save").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("assignment-question").first()).toContainText("Doğru Cevap: D");
    await expect(page.getByRole("button", { name: "Soru 1'i düzenle" })).toBeFocused();

    await page.getByRole("button", { name: "Soru 3'i çıkar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Soruyu Çıkar" }).click();
    await expect(page.getByTestId("assignment-question")).toHaveCount(11);
    await expect(page.getByTestId("assignment-question").last()).toHaveAttribute("data-order", "11");

    await page.getByTestId("assignment-publish").click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Ödev yayınlansın mı?" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Yayınla" }).click();
    await expect(page.getByTestId("assignment-state")).toHaveText("Açık");
    await expect(page.getByTestId("add-panels")).toHaveCount(0);
    await expect(page.getByTestId("assignment-publish")).toHaveCount(0);
    detail = await assignmentDetail(teacher, id);
    expect(detail.state).toBe("open");
    expect(detail.questions).toHaveLength(11);

    await logoutViaUi(page);
    const student = await activeUser("ogrenci", "odev");
    await login(page, student.userName, student.password);
    await page.goto(`/odevler?ders=${lesson.id}`);
    const card = page.getByTestId("assignment-card").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("assignment-progress")).toContainText("0 / 11");
    await card.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/odevler/${id}$`));
    await expect(page.getByTestId("assignment-title")).toHaveText(title);
    await expect(page.getByTestId("assignment-question")).toHaveCount(11);
    const rowA = page.getByTestId("assignment-question").filter({ hasText: `Havuz A ${stamp}` });
    await rowA.getByRole("link", { name: /Çöz/ }).click();
    await expect(page).toHaveURL(new RegExp(`/sorular/${poolA.id}\\?odev=${id}`));
    await expect(page.getByRole("link", { name: "Ödeve Dön" })).toBeVisible();
    await page.getByRole("radio", { name: "B şıkkı" }).click();
    await page.getByLabel(/^Çözümünüzü Anlatın/).fill(validExplanation(w.settings.aciklamaMinKarakter));
    await page.getByRole("button", { name: "Cevabı Gönder" }).click();
    await expect(page.getByTestId("answer-result")).toContainText("Doğru Cevap!");
    await page.getByRole("link", { name: "Ödeve Dön" }).click();
    await expect(page).toHaveURL(new RegExp(`/odevler/${id}$`));
    await expect(page.getByTestId("assignment-progress")).toContainText("1 / 11 soru çözüldü, 1 doğru");
    await expect(page.getByTestId("assignment-question").filter({ hasText: `Havuz A ${stamp}` })).toHaveAttribute("data-progress", "correct");
    await expectNoAxeViolations(page, "ogrenci-odev-detay");

    await logoutViaUi(page);
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    await expect(page.getByTestId("assignment-state")).toHaveText("Açık");
    await page.getByRole("link", { name: "Sonuçlar" }).click();
    await expect(page).toHaveURL(new RegExp(`/ogretmen/odevler/${id}/sonuclar$`));
    await expect(page.getByTestId("results-title")).toHaveText(title);
    await expect(page.getByTestId("total-questions")).toHaveText("11");
    await expect(page.getByTestId("participants")).toHaveText("1");
    const entry = entryFor(page, "result", student.userName);
    await expect(entry).toHaveAttribute("data-participation", "partial");
    await expect(entry).toContainText("Kısmi");
    await expect(entry).toContainText("1/11");
    await expect(page.getByTestId("summary-partial")).toContainText("1");
    await expect(page.getByTestId("question-result").filter({ hasText: "%100" })).toHaveCount(1);
    await expectNoAxeViolations(page, "odev-sonuclari");
    await entry.getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`/ogretmen/ogrenciler/${student.id}$`));
  });
});

test.describe("ödev listesi", () => {
  test("durum sekmeleri URL'de tutulur, katılım özeti görünür, müdür ders filtresi çalışır", async ({ page }) => {
    const w = await world();
    const lesson = await lastLesson();
    const other = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const stamp = Date.now().toString(36);
    const openTitle = `Liste açık ${stamp}`;
    const scheduledTitle = `Liste planlı ${stamp}`;
    const draftTitle = `Liste taslak ${stamp}`;
    const openId = await createOpenAssignment(teacher, lesson.id, openTitle, today, addDaysToDateOnly(today, LATE_END));
    await createOpenAssignment(teacher, lesson.id, scheduledTitle, addDaysToDateOnly(today, 1), addDaysToDateOnly(today, 4));
    await createDraftAssignment(teacher, lesson.id, draftTitle, today, addDaysToDateOnly(today, 2));
    const student = await activeUser("ogrenci", "liste");
    const detail = await assignmentDetail(teacher, openId);
    await answerQuestion(student, detail.questions[0]!.id, 2, validExplanation(w.settings.aciklamaMinKarakter));

    await loginAs(page, teacher);
    await page.goto("/ogretmen/odevler?benim=1");
    await expect(page.getByRole("heading", { name: "Ödev Yönetimi", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Açık" })).toHaveAttribute("aria-pressed", "true");
    const openCard = page.getByTestId("manage-assignment").filter({ hasText: openTitle });
    await expect(openCard).toBeVisible();
    await expect(openCard.getByTestId("question-count")).toHaveText("2");
    await expect(openCard.getByTestId("participant-count")).toHaveText("1");
    await expect(openCard.getByTestId("assignment-state")).toHaveText("Açık");
    await expect(page.getByTestId("manage-assignment").filter({ hasText: scheduledTitle })).toHaveCount(0);

    await page.getByRole("button", { name: "Planlı" }).click();
    await expect(page).toHaveURL(/durum=planli/);
    await expect(page.getByTestId("manage-assignment").filter({ hasText: scheduledTitle })).toBeVisible();
    await expect(page.getByTestId("manage-assignment").filter({ hasText: openTitle })).toHaveCount(0);

    await page.getByRole("button", { name: "Taslak" }).click();
    await expect(page).toHaveURL(/durum=taslak/);
    await expect(page.getByTestId("manage-assignment").filter({ hasText: draftTitle })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Taslak" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("manage-assignment").filter({ hasText: draftTitle })).toBeVisible();

    await page.getByRole("button", { name: "Kapandı" }).click();
    await expect(page.getByRole("button", { name: "Kapandı" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("manage-assignment").filter({ hasText: openTitle })).toHaveCount(0);

    await page.goto("/ogretmen/odevler?benim=1");
    await page.getByRole("link", { name: `Sonuçlar: ${openTitle}` }).click();
    await expect(page).toHaveURL(new RegExp(`/ogretmen/odevler/${openId}/sonuclar$`));

    await logoutViaUi(page);
    const mudur = await activeUser("mudur", "liste");
    await loginAs(page, mudur);
    await page.goto(`/ogretmen/odevler?ders=${lesson.id}`);
    await expect(page.getByLabel("Ders")).toHaveValue(String(lesson.id));
    await expect(page.getByTestId("manage-assignment").filter({ hasText: openTitle })).toBeVisible();
    await page.getByLabel("Ders").selectOption(String(other.id));
    await expect(page).toHaveURL(new RegExp(`ders=${other.id}`));
    await expect(page.getByTestId("manage-assignment").filter({ hasText: openTitle })).toHaveCount(0);
  });

  test("ödev kartında salt okunur ödev düzenleme yerine görüntüleme sunar", async ({ page }) => {
    const lesson = await lastLesson();
    const owner = await branchTeacher(lesson.id);
    const viewer = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const title = `Salt okunur ${Date.now().toString(36)}`;
    const id = await createDraftAssignment(owner, lesson.id, title, today, addDaysToDateOnly(today, 2));
    await loginAs(page, viewer);
    await page.goto("/ogretmen/odevler?durum=taslak");
    const card = page.getByTestId("manage-assignment").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Salt okunur");
    await card.getByRole("link", { name: `Görüntüle: ${title}` }).click();
    await expect(page).toHaveURL(new RegExp(`/ogretmen/odevler/${id}$`));
    await expect(page.getByTestId("assignment-publish")).toHaveCount(0);
    await expect(page.getByTestId("add-panels")).toHaveCount(0);
    await expect(page.getByTestId("assignment-save")).toHaveCount(0);
  });
});

test.describe("ileri tarihli ödev", () => {
  test("planlı ödev öğrenciye görünmez, yayından kaldırılınca taslağa döner; ileri tarihli yayın planlı olur", async ({ page }) => {
    const lesson = await lastLesson();
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const tomorrow = addDaysToDateOnly(today, 1);
    const stamp = Date.now().toString(36);
    const futureTitle = `İleri ödev ${stamp}`;
    const draftTitle = `Planlanacak ${stamp}`;
    const openTitle = `Bugünkü ödev ${stamp}`;
    const futureId = await createOpenAssignment(teacher, lesson.id, futureTitle, tomorrow, addDaysToDateOnly(today, 4));
    await createOpenAssignment(teacher, lesson.id, openTitle, today, addDaysToDateOnly(today, LATE_END));
    const draftId = await createDraftAssignment(teacher, lesson.id, draftTitle, addDaysToDateOnly(today, 2), addDaysToDateOnly(today, 5));
    await addTextQuestionsApi(teacher, draftId, 2, "Planlanacak");

    const student = await activeUser("ogrenci", "ileri");
    await login(page, student.userName, student.password);
    await page.goto(`/odevler?ders=${lesson.id}`);
    await expect(page.getByTestId("assignment-card").filter({ hasText: openTitle })).toBeVisible();
    await expect(page.getByTestId("assignment-card").filter({ hasText: futureTitle })).toHaveCount(0);
    await page.goto(`/odevler/${futureId}`);
    await expect(page.getByRole("heading", { name: "Ödev Bulunamadı" })).toBeVisible();
    const studentApi = await page.request.get(`/api/assignments/${futureId}`);
    expect(studentApi.status()).toBe(404);

    await logoutViaUi(page);
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${futureId}`);
    await expect(page.getByTestId("assignment-state")).toHaveText("Planlı");
    await expect(page.getByTestId("assignment-unpublish")).toBeVisible();
    await expect(page.getByTestId("assignment-delete")).toBeVisible();
    await page.getByTestId("assignment-unpublish").click();
    await page.getByRole("dialog").getByRole("button", { name: "Yayından Kaldır" }).click();
    await expect(page.getByTestId("assignment-state")).toHaveText("Taslak");
    expect((await assignmentDetail(teacher, futureId)).state).toBe("draft");

    await page.goto(`/ogretmen/odevler/${draftId}`);
    await expect(page.getByTestId("assignment-state")).toHaveText("Taslak");
    await expect(page.getByTestId("assignment-question")).toHaveCount(2);
    await page.getByTestId("assignment-publish").click();
    await expect(page.getByRole("dialog")).toContainText("tarihinde öğrencilere açılacak");
    await page.getByRole("dialog").getByRole("button", { name: "Yayınla" }).click();
    await expect(page.getByTestId("assignment-state")).toHaveText("Planlı");
    await expect(page.getByTestId("assignment-unpublish")).toBeVisible();
    expect((await assignmentDetail(teacher, draftId)).state).toBe("scheduled");

    await page.getByTestId("assignment-delete").click();
    await page.getByRole("dialog").getByRole("button", { name: "Ödevi Sil" }).click();
    await expect(page).toHaveURL(/\/ogretmen\/odevler$/);
    const gone = await backend("GET", `/api/assignments/${draftId}/manage`, { token: teacher.token });
    expect(gone.status).toBe(404);
  });

  test("bitiş tarihi başlangıçtan önce olamaz ve başlamış ödevde başlangıç tarihi kilitlidir", async ({ page }) => {
    const lesson = await lastLesson();
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const stamp = Date.now().toString(36);
    await loginAs(page, teacher);
    await page.goto("/ogretmen/odevler/yeni");
    await page.getByLabel(/^Başlangıç Tarihi/).fill(addDaysToDateOnly(today, 3));
    await page.getByLabel(/^Bitiş Tarihi/).fill(addDaysToDateOnly(today, 1));
    await page.getByTestId("assignment-create").click();
    await expect(page.getByText("Bitiş tarihi başlangıç tarihinden önce olamaz.")).toBeVisible();
    await expect(page).toHaveURL(/\/ogretmen\/odevler\/yeni$/);

    const openId = await createOpenAssignment(teacher, lesson.id, `Kilitli ${stamp}`, today, addDaysToDateOnly(today, LATE_END));
    await page.goto(`/ogretmen/odevler/${openId}`);
    await expect(page.getByTestId("assignment-state")).toHaveText("Açık");
    await expect(page.getByLabel(/^Başlangıç Tarihi/)).toBeDisabled();
    await expect(page.getByLabel(/^Bitiş Tarihi/)).toBeEnabled();
    await page.getByLabel(/^Bitiş Tarihi/).fill(addDaysToDateOnly(today, LATE_END + 3));
    await page.getByTestId("assignment-save").click();
    await expect(page.getByLabel(/^Bitiş Tarihi/)).toHaveValue(addDaysToDateOnly(today, LATE_END + 3));
    expect((await assignmentDetail(teacher, openId)).state).toBe("open");
    await expect(page.getByTestId("add-panels")).toHaveCount(0);
  });

  test("öğrenci panosundaki açık ödev kartı ve tüm ödevler bağlantısı gerçek ekrana gider", async ({ page }) => {
    const lesson = await lastLesson();
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const title = `Pano ödevi ${Date.now().toString(36)}`;
    const id = await createOpenAssignment(teacher, lesson.id, title, today, addDaysToDateOnly(today, LATE_END));
    const student = await activeUser("ogrenci", "pano");
    await login(page, student.userName, student.password);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await page.getByRole("link", { name: "Tüm Ödevler" }).click();
    await expect(page).toHaveURL(/\/odevler$/);
    await expect(page.getByRole("heading", { name: "Ödevlerim", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Açık Ödevler" })).toHaveAttribute("aria-pressed", "true");
    await page.goto(`/odevler?ders=${lesson.id}`);
    await expect(page.getByTestId("assignment-card").filter({ hasText: title })).toBeVisible();
    await page.getByRole("button", { name: "Kapanmış Ödevler" }).click();
    await expect(page).toHaveURL(/durum=kapandi/);
    await expect(page.getByTestId("assignment-card").filter({ hasText: title })).toHaveCount(0);
    await page.goto(`/odevler/${id}`);
    await expect(page.getByTestId("assignment-title")).toHaveText(title);
    await expect(page.getByTestId("assignment-remaining")).toContainText(/Gün Kaldı|Son Gün/);
    await page.getByRole("link", { name: "Sıradaki Soruya Geç" }).click();
    await expect(page).toHaveURL(new RegExp(`/sorular/\\d+\\?odev=${id}`));
  });
});

test.describe("havuza soru ekle", () => {
  test("planlı soru toplu eklenir ve listelenir, hemen yayınla seçeneği, öğrenci hak bilgisi yoktur", async ({ page }) => {
    test.setTimeout(240_000);
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const planDate = addDaysToDateOnly(today, 200 + Math.floor(Math.random() * 100));
    await loginAs(page, teacher);
    await page.goto("/ogretmen/soru-ekle");
    await expect(page.getByRole("heading", { name: "Havuza Soru Ekle", level: 1 })).toBeVisible();
    await expect(page.getByLabel(/^Ders\*?$/)).toBeDisabled();
    await expect(page.getByLabel(/^Ders\*?$/)).toHaveValue(String(lesson.id));
    await expect(page.getByTestId("quota")).toHaveCount(0);
    await expect(page.getByText(/günlük hak|soru yüklediniz/i)).toHaveCount(0);

    await page.getByLabel("Şu Tarihte Yayınla").check();
    await page.getByLabel("Yayın Tarihi").fill(today);
    await page.getByTestId("photo-input").setInputFiles(pngFiles(2, "plan"));
    await waitUploaded(page, 2);
    const cards = page.getByTestId("composer-card");
    await cards.nth(0).getByRole("radio", { name: "C şıkkı" }).click();
    await cards.nth(1).getByRole("radio", { name: "D şıkkı" }).click();
    await page.getByTestId("composer-submit").click();
    await expect(page.getByTestId("composer-notice")).toContainText("yarın ya da daha sonrası");
    const plannedOnDate = page.getByTestId("planned-item").filter({ hasText: formatDateOnly(planDate) });
    await expect(plannedOnDate).toHaveCount(0);

    await page.getByLabel("Yayın Tarihi").fill(planDate);
    await page.getByTestId("composer-submit").click();
    await expect(page.locator('[data-testid="composer-card"][data-phase="created"]')).toHaveCount(2, { timeout: 60_000 });
    await expect(plannedOnDate).toHaveCount(2);
    await expect(plannedOnDate.first().getByTestId("planned-date")).toContainText("Yayın:");
    const scheduled = await backend<{ items: { id: number; scheduledPublishDate: string | null; publishedAt: string | null }[] }>("GET", `/api/questions?scheduled=true&lessonId=${lesson.id}&pageSize=50`, { token: teacher.token });
    const planned = scheduled.body.items.filter((item) => item.scheduledPublishDate === planDate);
    expect(planned.length).toBeGreaterThanOrEqual(2);
    expect(planned.every((item) => item.publishedAt === null)).toBe(true);

    await page.getByRole("button", { name: "Eklenenleri Temizle" }).click();
    await page.getByLabel("Hemen Yayınla").check();
    await page.getByTestId("photo-input").setInputFiles(pngFiles(1, "hemen"));
    await waitUploaded(page, 1);
    await page.getByRole("radio", { name: "A şıkkı" }).click();
    await page.getByTestId("composer-submit").click();
    const link = page.getByTestId("photo-composer").getByRole("link", { name: "Soruyu Aç" }).first();
    await expect(link).toBeVisible({ timeout: 60_000 });
    const href = await link.getAttribute("href");
    const questionId = Number(href?.split("/").pop());
    const published = await backend<{ publishedAt: string | null; isHidden: boolean }>("GET", `/api/questions/${questionId}`, { token: teacher.token });
    expect(published.status).toBe(200);
    expect(published.body.publishedAt).not.toBeNull();
    await expectNoAxeViolations(page, "havuza-soru-ekle");
  });
});

test.describe("konu planı", () => {
  test("konu seç, değiştir, sil; yarın için eksik konu vurgulanır", async ({ page }) => {
    await ensureFullWeekSchedule();
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const planDate = nextWeekdayFrom(today, 9);
    const tomorrow = addDaysToDateOnly(today, 1);
    const first = lesson.topics[0]!;
    const second = lesson.topics[1]!;
    await clearTopicPlan(teacher.token, planDate, lesson.id);
    await clearTopicPlan(teacher.token, tomorrow, lesson.id);

    await loginAs(page, teacher);
    await page.goto("/ogretmen/konu-plani");
    await expect(page.getByRole("heading", { name: "Konu Planı", level: 1 })).toBeVisible();
    await expect(page.getByTestId("tomorrow-missing")).toContainText(lesson.name);
    const missing = page.locator('[data-testid="plan-row"][data-missing="true"], [data-testid="plan-card"][data-missing="true"]').locator("visible=true");
    await expect(missing).toHaveCount(1);
    await expect(missing).toContainText(lesson.name);
    await expect(page.getByTestId("missing-badge").locator("visible=true")).toHaveCount(1);
    await expectNoAxeViolations(page, "konu-plani");

    await setTopicPlan(teacher.token, tomorrow, lesson.id, first.id);
    await page.reload();
    await expect(page.getByTestId("tomorrow-missing")).toHaveCount(0);

    await page.goto(`/ogretmen/konu-plani?hafta=${planDate}`);
    await expect(page.getByTestId("week-range")).toContainText("–");
    const edit = page.getByTestId("plan-edit").locator("visible=true").first();
    await expect(edit).toHaveAccessibleName(/Konu seç/);
    await edit.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Hedef Soru Sayısı")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog.getByText("Konuyu seçin.")).toBeVisible();
    await dialog.getByLabel(/^Konu\*?$/).selectOption(String(first.id));
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog).toHaveCount(0);
    const firstDay = page.locator(`[data-date="${planDate}"]`).locator("visible=true").first();
    await expect(firstDay).toContainText(first.name);
    await expect(firstDay).toContainText("Planlandı");
    await expect(page.getByTestId("plan-edit").locator("visible=true").first()).toBeFocused();

    await page.getByTestId("plan-edit").locator("visible=true").first().click();
    await page.getByRole("dialog").getByLabel(/^Konu\*?$/).selectOption(String(second.id));
    await page.getByRole("dialog").getByRole("button", { name: "Kaydet" }).click();
    await expect(firstDay).toContainText(second.name);

    await page.getByTestId("plan-delete").locator("visible=true").first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Planı Sil" }).click();
    await expect(firstDay).toContainText("Konu Seçilmedi");
    await expect(firstDay).not.toContainText(second.name);
  });

  test("hafta gezintisi geçmişe gitmez ve URL'de tutulur", async ({ page }) => {
    await ensureFullWeekSchedule();
    const w = await world();
    const teacher = await branchTeacher(w.lessons[0]!.id);
    const today = todayInIstanbul();
    await loginAs(page, teacher);
    await page.goto("/ogretmen/konu-plani");
    await expect(page.getByTestId("week-prev")).toBeDisabled();
    await expect(page.getByTestId("week-today")).toBeDisabled();
    await page.getByTestId("week-next").click();
    await expect(page).toHaveURL(new RegExp(`hafta=${addDaysToDateOnly(today, 7)}`));
    await expect(page.getByTestId("week-today")).toBeEnabled();
    await page.getByTestId("week-prev").click();
    await expect(page).not.toHaveURL(/hafta=/);
    await page.goto("/ogretmen/konu-plani?hafta=2020-01-01");
    await expect(page.getByTestId("week-range")).toContainText(String(new Date().getFullYear()));
  });

  test("müdür tüm dersleri görür ve hedef soru sayısını belirler", async ({ page }) => {
    await ensureFullWeekSchedule();
    const w = await world();
    const lesson = w.lessons[1]!;
    const mudur = await activeUser("mudur", "plan");
    const planDate = nextWeekdayFrom(todayInIstanbul(), 12);
    await clearTopicPlan(mudur.token, planDate, lesson.id);
    await loginAs(page, mudur);
    await page.goto(`/ogretmen/konu-plani?hafta=${planDate}`);
    const rows = page.locator('[data-testid="plan-row"], [data-testid="plan-card"]').locator("visible=true");
    await expect.poll(async () => rows.count()).toBeGreaterThan(w.lessons.length);
    const row = rows.filter({ hasText: lesson.name }).first();
    await row.getByTestId("plan-edit").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Konu\*?$/).selectOption(String(lesson.topics[0]!.id));
    await dialog.getByLabel("Hedef Soru Sayısı").fill("abc");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog.getByText("Hedef soru sayısı sayı olmalı.")).toBeVisible();
    await dialog.getByLabel("Hedef Soru Sayısı").fill("3");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(rows.filter({ hasText: lesson.name }).first()).toContainText("3");
    await clearTopicPlan(mudur.token, planDate, lesson.id);
  });
});

test.describe("branşsız öğretmen", () => {
  test("ödev oluşturma, havuza soru ekleme ve konu planı bilgi ekranı gösterir; ödev listesi açılır", async ({ page }) => {
    const teacher = await activeUser("ogretmen", "bransiz");
    await loginAs(page, teacher);
    for (const path of ["/ogretmen/odevler/yeni", "/ogretmen/soru-ekle", "/ogretmen/konu-plani"]) {
      await page.goto(path);
      await expect(page.getByTestId("no-branch")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Branş Tanımlanmamış" })).toBeVisible();
    }
    await page.goto("/ogretmen/odevler");
    await expect(page.getByRole("heading", { name: "Ödev Yönetimi", level: 1 })).toBeVisible();
    await expect(page.getByTestId("no-branch")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Yeni Ödev" }).first()).toBeVisible();
  });
});

test.describe("çakışma", () => {
  test("iki sekmede aynı ödevi düzenlemek 409 bandı gösterir ve güncel hali yükler", async ({ page }) => {
    const lesson = await lastLesson();
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const stamp = Date.now().toString(36);
    const id = await createDraftAssignment(teacher, lesson.id, `Çakışma ${stamp}`, today, addDaysToDateOnly(today, 2));
    await loginAs(page, teacher);
    const second = await page.context().newPage();
    await page.goto(`/ogretmen/odevler/${id}`);
    await second.goto(`/ogretmen/odevler/${id}`);
    await expect(second.getByTestId("assignment-title")).toHaveText(`Çakışma ${stamp}`);

    await page.getByLabel("Başlık", { exact: true }).fill(`Birinci sekme ${stamp}`);
    await page.getByTestId("assignment-save").click();
    await expect(page.getByTestId("assignment-title")).toHaveText(`Birinci sekme ${stamp}`);

    await second.getByLabel("Açıklama", { exact: true }).fill("İkinci sekme açıklaması");
    await second.getByTestId("assignment-save").click();
    await expect(second.getByTestId("problem-banner")).toContainText("başka bir işlemle değiştirilmiş");
    await expect(second.getByTestId("assignment-title")).toHaveText(`Birinci sekme ${stamp}`);
    await expect(second.getByLabel("Başlık", { exact: true })).toHaveValue(`Birinci sekme ${stamp}`);

    await second.getByLabel("Açıklama", { exact: true }).fill("İkinci sekme yeniden denedi");
    await second.getByTestId("assignment-save").click();
    await expect(second.getByTestId("assignment-save")).toBeDisabled();
    expect((await assignmentDetail(teacher, id)).title).toBe(`Birinci sekme ${stamp}`);
    await second.close();
  });

  test("ödev başka sekmede silinince bulunamadı ekranı gösterilir", async ({ page }) => {
    const lesson = await lastLesson();
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const id = await createDraftAssignment(teacher, lesson.id, `Silinecek ${Date.now().toString(36)}`, today, addDaysToDateOnly(today, 2));
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    await expect(page.getByTestId("assignment-state")).toHaveText("Taslak");
    const detail = await assignmentDetail(teacher, id);
    const removed = await backend("DELETE", `/api/assignments/${id}?rowVersion=${encodeURIComponent(detail.rowVersion)}`, { token: teacher.token });
    expect(removed.status).toBe(204);
    await page.getByLabel("Başlık", { exact: true }).fill("Değişti");
    await page.getByTestId("assignment-save").click();
    await expect(page.getByTestId("problem-banner").or(page.getByRole("heading", { name: "Ödev Bulunamadı" }))).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ödev Bulunamadı" })).toBeVisible();
  });
});

test.describe("duyarlı düzen", () => {
  test("ödev ekranları 375, 768 ve 1280 genişlikte taşmaz ve axe temizdir", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await ensureFullWeekSchedule();
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const stamp = Date.now().toString(36);
    const openId = await createOpenAssignment(teacher, lesson.id, `Düzen ödevi ${stamp}`, today, addDaysToDateOnly(today, LATE_END));
    const draftId = await createDraftAssignment(teacher, lesson.id, `Düzen taslağı ${stamp}`, today, addDaysToDateOnly(today, 3));
    await addTextQuestionsApi(teacher, draftId, 3, "Düzen");
    const student = await activeUser("ogrenci", "duzen");
    const detail = await assignmentDetail(teacher, openId);
    await answerQuestion(student, detail.questions[0]!.id, 1, validExplanation(w.settings.aciklamaMinKarakter));

    await loginAs(page, teacher);
    const sizes: (number | null)[] = testInfo.project.name === "webkit-iphone" ? [null] : [375, 768, 1280];
    const teacherRoutes: { path: string; ready: () => Promise<void> }[] = [
      { path: "/ogretmen/odevler?benim=1", ready: () => expect(page.getByTestId("manage-assignment").first()).toBeVisible() },
      { path: "/ogretmen/odevler/yeni", ready: () => expect(page.getByTestId("assignment-create")).toBeVisible() },
      { path: `/ogretmen/odevler/${draftId}`, ready: () => expect(page.getByTestId("assignment-question")).toHaveCount(3) },
      { path: `/ogretmen/odevler/${openId}/sonuclar`, ready: () => expect(page.getByTestId("question-result").first()).toBeVisible() },
      { path: "/ogretmen/soru-ekle", ready: () => expect(page.getByTestId("photo-input")).toBeAttached() },
      { path: "/ogretmen/konu-plani", ready: () => expect(page.locator('[data-testid="plan-row"], [data-testid="plan-card"]').locator("visible=true").first()).toBeVisible() },
    ];
    for (const size of sizes) {
      if (size !== null) await page.setViewportSize({ width: size, height: 900 });
      for (const route of teacherRoutes) {
        await page.goto(route.path);
        await route.ready();
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route.path} ${size ?? "iphone"}`).toBeLessThanOrEqual(0);
        await expectNoAxeViolations(page, `${route.path}-${size ?? "iphone"}`);
      }
    }

    await logoutViaUi(page);
    await login(page, student.userName, student.password);
    const studentRoutes: { path: string; ready: () => Promise<void> }[] = [
      { path: `/odevler?ders=${lesson.id}`, ready: () => expect(page.getByTestId("assignment-card").first()).toBeVisible() },
      { path: `/odevler/${openId}`, ready: () => expect(page.getByTestId("assignment-question").first()).toBeVisible() },
    ];
    for (const size of sizes) {
      if (size !== null) await page.setViewportSize({ width: size, height: 900 });
      for (const route of studentRoutes) {
        await page.goto(route.path);
        await route.ready();
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route.path} ${size ?? "iphone"}`).toBeLessThanOrEqual(0);
        await expectNoAxeViolations(page, `${route.path}-${size ?? "iphone"}`);
      }
    }
  });
});

test.describe("branşa bağlı içerik üretimi (API)", () => {
  test("öğretmen başka branşa ödev, ödev sorusu ve havuz sorusu oluşturamaz; branşsız öğretmen de oluşturamaz", async () => {
    const w = await world();
    const own = w.lessons[0]!;
    const foreign = w.lessons[1]!;
    const teacher = await branchTeacher(own.id);
    const outsider = await activeUser("ogretmen", "bransiz");
    const today = todayInIstanbul();
    const body = (lessonId: number) => ({ lessonId, title: "Yetkisiz ödev", description: null, startDate: today, endDate: addDaysToDateOnly(today, 2) });
    const questionBody = (lessonId: number) => ({
      lessonId,
      topicId: null,
      text: "Yetkisiz soru: Hangisi doğrudur?",
      imageFileId: null,
      optionA: "Birinci",
      optionB: "İkinci",
      optionC: "Üçüncü",
      optionD: "Dördüncü",
      correctOption: 2,
      description: null,
      scheduledPublishDate: null,
    });

    expect((await backend("POST", "/api/assignments", { token: teacher.token, body: body(foreign.id) })).status).toBe(403);
    expect((await backend("POST", "/api/assignments", { token: outsider.token, body: body(own.id) })).status).toBe(403);
    expect((await backend("POST", "/api/questions", { token: teacher.token, body: questionBody(foreign.id) })).status).toBe(403);
    expect((await backend("POST", "/api/questions", { token: outsider.token, body: questionBody(own.id) })).status).toBe(403);

    const foreignOwner = await branchTeacher(foreign.id);
    const foreignAssignment = await createDraftAssignment(foreignOwner, foreign.id, "Başka branş ödevi", today, addDaysToDateOnly(today, 2));
    const item = { text: "Yetkisiz ödev sorusu", imageFileId: null, optionA: "A", optionB: "B", optionC: "C", optionD: "D", correctOption: 1, topicId: null, description: null };
    expect((await backend("POST", `/api/assignments/${foreignAssignment}/questions`, { token: teacher.token, body: { items: [item] } })).status).toBe(403);
    expect((await backend("POST", `/api/assignments/${foreignAssignment}/questions`, { token: outsider.token, body: { items: [item] } })).status).toBe(403);
    expect((await assignmentDetail(foreignOwner, foreignAssignment)).questions).toHaveLength(0);

    const ownCreated = await backend("POST", "/api/assignments", { token: teacher.token, body: body(own.id) });
    expect(ownCreated.status).toBe(201);
  });
});

test.describe("ödeve fotoğraf eklemede belirsiz hata", () => {
  async function openDraft(page: Page) {
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const id = await createDraftAssignment(teacher, lesson.id, `Belirsiz ${Date.now().toString(36)}`, today, addDaysToDateOnly(today, 2));
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    await expect(page.getByTestId("assignment-state")).toHaveText("Taslak");
    return { teacher, id };
  }

  async function dropFirstResponse(page: Page) {
    const calls: unknown[] = [];
    await page.route("**/api/assignments/*/questions", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      calls.push(route.request().postDataJSON());
      if (calls.length === 1) {
        await route.fetch();
        return route.abort("failed");
      }
      return route.continue();
    });
    return calls;
  }

  test("ilk yanıt kaybolur, yeniden gönderilir, tek soru oluşur", async ({ page }) => {
    const { teacher, id } = await openDraft(page);
    const calls = await dropFirstResponse(page);
    await page.getByTestId("photo-input").setInputFiles(pngFiles(1));
    await waitUploaded(page, 1);
    await page.getByTestId("composer-card").getByRole("radio", { name: "B şıkkı" }).click();
    await page.getByTestId("composer-submit").click();
    await expect(page.getByTestId("card-error")).toContainText("Bağlantı kurulamadı");
    await expect(page.getByTestId("card-uncertain")).toBeVisible();

    await page.getByTestId("composer-submit").click();
    await expect(page.locator('[data-testid="composer-card"][data-phase="created"]')).toHaveCount(1, { timeout: 20_000 });
    expect(calls).toHaveLength(2);
    await expect(page.getByTestId("card-note")).toHaveCount(0);
    await expect(page.getByTestId("assignment-question")).toHaveCount(1);
    const detail = await assignmentDetail(teacher, id);
    expect(detail.questions).toHaveLength(1);
    expect(detail.questions[0]!.correctOption).toBe(2);
  });

  test("kayıp yanıttan sonra şık değiştirilirse düzenleme sessizce yutulmaz, doğru şık güncellenir", async ({ page }) => {
    const { teacher, id } = await openDraft(page);
    const calls = await dropFirstResponse(page);
    await page.getByTestId("photo-input").setInputFiles(pngFiles(1));
    await waitUploaded(page, 1);
    const card = page.getByTestId("composer-card");
    await card.getByRole("radio", { name: "B şıkkı" }).click();
    await page.getByTestId("composer-submit").click();
    await expect(page.getByTestId("card-error")).toContainText("Bağlantı kurulamadı");

    await card.getByRole("radio", { name: "D şıkkı" }).click();
    await expect(page.getByTestId("card-uncertain")).toContainText("ardından yaptığınız değişiklik uygulanır");
    await page.getByTestId("composer-submit").click();
    await expect(page.locator('[data-testid="composer-card"][data-phase="created"]')).toHaveCount(1, { timeout: 20_000 });
    expect(calls).toHaveLength(2);
    expect((calls[1] as { items: { correctOption: number }[] }).items[0]!.correctOption).toBe(2);
    await expect(page.getByTestId("assignment-question")).toHaveCount(1);
    const detail = await assignmentDetail(teacher, id);
    expect(detail.questions).toHaveLength(1);
    expect(detail.questions[0]!.correctOption).toBe(4);
  });
});

test.describe("ödev düzenleme sayfası korumaları", () => {
  test("kaydedilmemiş değişiklikle ayrılmak onay ister; konu temizlenir", async ({ page }) => {
    const w = await world();
    const lesson = w.lessons.find((entry) => entry.topics.length > 0) ?? w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const id = await createDraftAssignment(teacher, lesson.id, `Koruma ${Date.now().toString(36)}`, today, addDaysToDateOnly(today, 2));
    const topic = lesson.topics[0];
    expect(topic).toBeDefined();
    const added = await backend("POST", `/api/assignments/${id}/questions`, {
      token: teacher.token,
      body: { items: [{ text: "Konulu soru", imageFileId: null, optionA: "A", optionB: "B", optionC: "C", optionD: "D", correctOption: 1, topicId: topic!.id, description: null }] },
    });
    expect(added.status).toBe(201);

    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    await page.getByLabel("Başlık", { exact: true }).fill("Değişmiş başlık");
    const messages: string[] = [];
    page.once("dialog", async (dialog) => {
      messages.push(dialog.message());
      await dialog.dismiss();
    });
    await page.getByRole("main").getByRole("link", { name: "Ödev Yönetimi", exact: true }).click();
    await expect.poll(() => messages.length).toBe(1);
    expect(messages[0]).toContain("Kaydedilmemiş değişiklikler");
    await expect(page).toHaveURL(new RegExp(`/ogretmen/odevler/${id}$`));
    await page.getByLabel("Başlık", { exact: true }).fill((await assignmentDetail(teacher, id)).title);
    await expect(page.getByTestId("assignment-save")).toBeDisabled();

    await page.getByRole("button", { name: "Soru 1'i düzenle" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Konu")).toHaveValue(String(topic!.id));
    await dialog.getByLabel("Konu").selectOption("");
    await dialog.getByTestId("question-save").click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(async () => (await assignmentDetail(teacher, id)).questions[0]!.topic ?? null).toBeNull();
  });

  test("havuz sorusunun şıkkını değiştirmek onay ister; ödev sorusunda onay çıkmaz", async ({ page }) => {
    const lesson = await lastLesson();
    const teacher = await branchTeacher(lesson.id);
    const today = todayInIstanbul();
    const stamp = Date.now().toString(36);
    const id = await createDraftAssignment(teacher, lesson.id, `Havuz onayı ${stamp}`, today, addDaysToDateOnly(today, 2));
    const pool = await scheduledPoolQuestion(teacher, lesson.id, `Havuz onay ${stamp}: Hangisi doğrudur?`, addDaysToDateOnly(today, 2));
    const attached = await backend("POST", `/api/assignments/${id}/questions/attach`, { token: teacher.token, body: { questionIds: [pool.id] } });
    expect(attached.status).toBe(201);
    await addTextQuestionsApi(teacher, id, 1, `Ödev ${stamp}`);

    const patches: string[] = [];
    await page.route("**/api/assignments/*/questions/*", async (route) => {
      if (route.request().method() === "PATCH") patches.push(route.request().url());
      return route.continue();
    });

    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    const poolRow = page.getByTestId("assignment-question").filter({ hasText: `Havuz onay ${stamp}` });
    await expect(poolRow).toContainText("Doğru Cevap: B");

    await poolRow.getByRole("button", { name: /düzenle/ }).click();
    const edit = page.getByRole("dialog", { name: "Soruyu Düzenle" });
    await expect(edit.getByTestId("pool-answer-note")).toContainText("şık değişimi tüm cevapları etkiler");
    await edit.getByRole("radio", { name: "D şıkkı" }).click();
    await edit.getByTestId("question-save").click();
    const confirm = page.getByRole("dialog", { name: "Havuz Sorusunun Cevabı Değişecek" });
    await expect(confirm).toContainText("tüm cevapların puanını yeniden hesaplar");
    await expectNoAxeViolations(page, "havuz-cevap-onayi");
    await confirm.getByRole("button", { name: "Vazgeç" }).click();
    await expect(confirm).toHaveCount(0);
    expect(patches).toHaveLength(0);
    await expect(edit.getByRole("radio", { name: "B şıkkı" })).toBeChecked();
    expect((await assignmentDetail(teacher, id)).questions.find((question) => question.id === pool.id)!.correctOption).toBe(2);

    await edit.getByRole("radio", { name: "D şıkkı" }).click();
    await edit.getByTestId("question-save").click();
    await page.getByRole("dialog", { name: "Havuz Sorusunun Cevabı Değişecek" }).getByRole("button", { name: "Cevabı Değiştir" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(poolRow).toContainText("Doğru Cevap: D");
    expect(patches).toHaveLength(1);
    expect((await assignmentDetail(teacher, id)).questions.find((question) => question.id === pool.id)!.correctOption).toBe(4);

    const own = page.getByTestId("assignment-question").filter({ hasText: `Ödev ${stamp}` });
    await own.getByRole("button", { name: /düzenle/ }).click();
    const ownEdit = page.getByRole("dialog", { name: "Soruyu Düzenle" });
    await expect(ownEdit.getByTestId("pool-answer-note")).toHaveCount(0);
    await ownEdit.getByRole("radio", { name: "C şıkkı" }).click();
    await ownEdit.getByTestId("question-save").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(own).toContainText("Doğru Cevap: C");
    expect(patches).toHaveLength(2);
  });

  test("süre 60 günü aşınca ilgili alanda uyarı çıkar", async ({ page }) => {
    const w = await world();
    const teacher = await branchTeacher(w.lessons[0]!.id);
    const today = todayInIstanbul();
    await loginAs(page, teacher);
    await page.goto("/ogretmen/odevler/yeni");
    await page.getByLabel(/^Bitiş Tarihi/).fill(addDaysToDateOnly(today, 70));
    await page.getByTestId("assignment-create").click();
    await expect(page.getByText("Ödev süresi en fazla 60 gün olabilir.")).toBeVisible();
    await expect(page).toHaveURL(/\/ogretmen\/odevler\/yeni$/);
  });
});
