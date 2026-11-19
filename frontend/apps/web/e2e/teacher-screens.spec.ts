import { addDaysToDateOnly, todayInIstanbul } from "@lgs/api";
import type { Page } from "@playwright/test";
import { branchTeacher, setBranch } from "./support/ai";
import { expectNoAxeViolations } from "./support/axe";
import { backend, banAccount } from "./support/backend";
import { expect, login, test } from "./support/fixtures";
import { activeUser, answerQuestion, createOpenAssignment, createTextQuestion } from "./support/student-data";
import { answerPool, namedStudent, needsSolutionIds, reportQuestion, studentQuestion, wrongAnsweredQuestion } from "./support/teacher-data";
import { validExplanation, world, authorFor } from "./support/world";

async function loginAs(page: Page, user: { userName: string; password: string }) {
  await login(page, user.userName, user.password);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
}

function studentEntry(page: Page, userName: string) {
  return page
    .locator(`[data-testid="student-row"][data-user-name="${userName}"], [data-testid="student-card"][data-user-name="${userName}"]`)
    .locator("visible=true");
}

test.describe("öğrenciler", () => {
  test("arama, sıralama, banlı rozeti ve profile geçiş", async ({ page }) => {
    const w = await world();
    const stamp = `Sira${Date.now().toString(36)}`;
    const first = await namedStudent("Ahmet", stamp);
    const second = await namedStudent("Zeynep", stamp);
    const teacher = await branchTeacher(w.lessons[0]!.id);
    const q1 = await createTextQuestion(await authorFor(w.lessons[0]!.id), w.lessons[0]!.id, `Profil sorusu ${stamp}: Hangisi doğrudur?`, 2);
    const q2 = await createTextQuestion(await authorFor(w.lessons[1]!.id), w.lessons[1]!.id, `Profil sorusu ${stamp} iki: Hangisi doğrudur?`, 2);
    await answerQuestion(second, q1.id, 2, validExplanation(w.settings.aciklamaMinKarakter));
    await answerQuestion(second, q2.id, 3, validExplanation(w.settings.aciklamaMinKarakter));
    await banAccount(first.id);

    await loginAs(page, teacher);
    await page.goto("/ogretmen/ogrenciler");
    await expect(page.getByRole("heading", { name: "Öğrenciler", level: 1 })).toBeVisible();

    await page.getByLabel("Öğrenci ara").fill(stamp);
    await expect(page).toHaveURL(new RegExp(`ara=${stamp}`));
    await expect(studentEntry(page, first.userName)).toBeVisible();
    await expect(studentEntry(page, second.userName)).toBeVisible();
    await expect(studentEntry(page, first.userName)).toContainText("Banlı");
    await expect(studentEntry(page, second.userName)).toContainText(/az önce|dakika önce/);
    await expect(studentEntry(page, second.userName)).toContainText("%50");

    const visibleNames = () =>
      page
        .locator('[data-testid="student-row"], [data-testid="student-card"]')
        .locator("visible=true")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-user-name")));
    await expect.poll(visibleNames).toEqual([first.userName, second.userName]);

    await page.getByLabel("Sıralama").selectOption("points");
    await expect(page).toHaveURL(/sirala=puan/);
    await expect.poll(visibleNames).toEqual([second.userName, first.userName]);
    await expectNoAxeViolations(page, "ogrenciler-liste");

    await page.getByLabel("Öğrenci ara").fill(`${stamp}-yok`);
    await expect(page.getByRole("heading", { name: "Eşleşen öğrenci yok" })).toBeVisible();

    await page.getByLabel("Öğrenci ara").fill(stamp);
    await studentEntry(page, second.userName).getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`/ogretmen/ogrenciler/${second.id}$`));
    await expect(page.getByTestId("student-name")).toHaveText(`Zeynep ${stamp}`);
    const stats = page.getByTestId("profile-stats");
    await expect(stats.getByRole("heading", { name: "Puan ve sıra" })).toBeVisible();
    const lessonRows = page.getByTestId("lesson-row");
    await expect(lessonRows.filter({ hasText: w.lessons[0]!.name }).first()).toContainText("%100");
    await expect(lessonRows.filter({ hasText: w.lessons[1]!.name }).first()).toContainText("%0");
    await expect(stats.getByRole("heading", { name: "Ödev katılımı" })).toBeVisible();
    await expect(stats.getByRole("heading", { name: "Katkıları" })).toBeVisible();
    await expectNoAxeViolations(page, "ogrenci-profil");

    await page.goto(`/ogretmen/ogrenciler/${first.id}`);
    await expect(page.getByTestId("student-name")).toHaveText(`Ahmet ${stamp}`);
    await expect(page.getByText("Banlı").first()).toBeVisible();
    await expect(page.getByText("Sırada değil").first()).toBeVisible();
  });

  test("öğrenci olmayan numara 404 durumunu gösterir", async ({ page }) => {
    const w = await world();
    const teacher = await branchTeacher(w.lessons[0]!.id);
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/ogrenciler/${teacher.id}`);
    await expect(page.getByRole("heading", { name: "Öğrenci bulunamadı" })).toBeVisible();
  });
});

test.describe("çözüm bekleyenler", () => {
  test("eşik cümlesi, listeden çıkarma ve geri alma", async ({ page }) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const question = await wrongAnsweredQuestion(teacher, lesson.id, null);

    await loginAs(page, teacher);
    await page.goto("/ogretmen/cozum-bekleyenler");
    await expect(page.getByTestId("threshold-sentence")).toContainText("En az 5 öğrencinin çözdüğü ve yanlış oranı %60 ve üzeri olan sorular");
    const item = page.locator(`[data-testid="needs-item"][data-question-id="${question.id}"]`);
    await expect(item).toBeVisible();
    await expect(item.getByTestId("wrong-rate")).toHaveText("%100");
    await expect(item.getByTestId("answer-counts")).toHaveText("5 / 5");
    await expect(item).toContainText("Hangisi doğrudur?");
    await expectNoAxeViolations(page, "cozum-bekleyenler");

    await item.getByRole("button", { name: /Listeden çıkar/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Listeden çıkar" }).click();
    await expect(item).toHaveCount(0);
    expect(await needsSolutionIds(teacher.token, lesson.id)).not.toContain(question.id);

    await page.getByRole("button", { name: "Geri al" }).click();
    await expect(item).toBeVisible();
    expect(await needsSolutionIds(teacher.token, lesson.id)).toContain(question.id);
  });

  test("çözüm ekle formu açık gelir, kaydedince soru listeden düşer", async ({ page }) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const question = await wrongAnsweredQuestion(teacher, lesson.id, null, "Çözüm ekleme sorusu");

    await loginAs(page, teacher);
    await page.goto("/ogretmen/cozum-bekleyenler");
    const item = page.locator(`[data-testid="needs-item"][data-question-id="${question.id}"]`);
    await item.getByRole("link", { name: /Çözüm ekle/ }).click();
    await expect(page).toHaveURL(new RegExp(`/sorular/${question.id}\\?cozum=ogretmen$`));
    const form = page.getByTestId("teacher-solution-form");
    await expect(form).toBeVisible();
    await expect(page.getByLabel("Çözüm metni")).toBeFocused();
    await expect(form.getByRole("button", { name: "Çözümü kaydet" })).toBeDisabled();
    await expectNoAxeViolations(page, "ogretmen-cozum-formu");

    await page.getByLabel("Çözüm metni").fill("Şıkları eleyerek ikinci seçeneğe ulaşılır: $2+2=4$.");
    await form.getByRole("button", { name: "Çözümü kaydet" }).click();
    await expect(page.getByTestId("teacher-solution-exists")).toBeVisible();
    await expect(page).not.toHaveURL(/cozum=ogretmen/);
    await expect(page.getByTestId("solution").filter({ hasText: "Öğretmen çözümü" })).toBeVisible();
    expect(await needsSolutionIds(teacher.token, lesson.id)).not.toContain(question.id);

    await page.goto("/ogretmen/cozum-bekleyenler");
    await expect(page.getByRole("heading", { name: "Çözüm Bekleyenler", level: 1 })).toBeVisible();
    await expect(page.locator(`[data-testid="needs-item"][data-question-id="${question.id}"]`)).toHaveCount(0);
  });

  test("başka branştaki öğretmen çözüm ekle kartını görmez, branş öğretmeni görür", async ({ page, browser }) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    const owner = await branchTeacher(lesson.id);
    const outsider = await branchTeacher(w.lessons[1]!.id);
    const question = await wrongAnsweredQuestion(owner, lesson.id, null, "Branş kısıtı sorusu");

    await loginAs(page, outsider);
    await page.goto(`/sorular/${question.id}?cozum=ogretmen`);
    await expect(page.getByRole("heading", { name: "Çözümler" })).toBeVisible();
    await expect(page.getByTestId("teacher-solution-section")).toHaveCount(0);
    await expect(page.getByTestId("teacher-solution-form")).toHaveCount(0);
    const refused = await backend("POST", `/api/questions/${question.id}/solutions/teacher`, { token: outsider.token, body: { text: "Deneme", imageFileId: null } });
    expect(refused.status).toBe(403);

    const context = await browser.newContext();
    const ownPage = await context.newPage();
    try {
      await loginAs(ownPage, owner);
      await ownPage.goto(`/sorular/${question.id}`);
      await expect(ownPage.getByTestId("teacher-solution-open")).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("başka öğretmen önce çözüm eklediyse 409 iletisi gösterilir", async ({ page }) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const other = await branchTeacher(lesson.id);
    const question = await wrongAnsweredQuestion(teacher, lesson.id, null, "Çakışan çözüm sorusu");

    await loginAs(page, teacher);
    await page.goto(`/sorular/${question.id}?cozum=ogretmen`);
    await page.getByLabel("Çözüm metni").fill("Benim çözümüm bu.");
    const created = await backend("POST", `/api/questions/${question.id}/solutions/teacher`, { token: other.token, body: { text: "Diğer öğretmenin çözümü", imageFileId: null } });
    expect(created.status).toBe(201);
    await page.getByRole("button", { name: "Çözümü kaydet" }).click();
    await expect(page.getByTestId("problem-banner")).toContainText("zaten bir öğretmen çözümü");
    await expect(page.getByTestId("teacher-solution-exists")).toBeVisible();
  });

  test("müdür ders filtresi uygular", async ({ page }) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    const otherLesson = w.lessons[1]!;
    const creator = await authorFor(lesson.id);
    const question = await wrongAnsweredQuestion(creator, lesson.id, null, "Müdür filtre sorusu");
    const mudur = await activeUser("mudur", "mudur");

    await loginAs(page, mudur);
    await page.goto("/ogretmen/cozum-bekleyenler");
    const item = page.locator(`[data-testid="needs-item"][data-question-id="${question.id}"]`);
    await expect(item).toBeVisible();
    await page.getByLabel("Ders").selectOption(String(otherLesson.id));
    await expect(page).toHaveURL(new RegExp(`ders=${otherLesson.id}`));
    await expect(item).toHaveCount(0);
    await page.getByLabel("Ders").selectOption(String(lesson.id));
    await expect(item).toBeVisible();
  });

  test("branşsız öğretmen bilgi ekranı görür, pano kırılmaz", async ({ page }) => {
    const nobranch = await activeUser("ogretmen", "nobranch");
    const refused = await backend<{ detail?: string }>("GET", "/api/questions/needs-solution", { token: nobranch.token });
    expect(refused.status).toBe(403);
    expect(refused.body.detail).toContain("branş");

    await loginAs(page, nobranch);
    await expect(page.getByTestId("card-no-branch")).toContainText("branş dersi tanımlanmamış");
    await expect(page.getByTestId("card-needs-solution")).toHaveCount(0);
    await expect(page.getByTestId("card-disputed")).toHaveCount(0);
    await expect(page.getByTestId("reports-count")).toBeVisible();
    await expect(page.getByTestId("card-students")).toBeVisible();
    await expect(page.getByTestId("card-error")).toHaveCount(0);

    await page.goto("/ogretmen/cozum-bekleyenler");
    await expect(page.getByTestId("no-branch")).toContainText("branş dersi tanımlanmamış");
    await expectNoAxeViolations(page, "cozum-bekleyenler-bransiz");
  });
});

test.describe("liste dayanıklılığı", () => {
  test("aralık dışı sayfa son geçerli sayfaya döner, çıkarılanlar sekmesinden geri alınır", async ({ page }) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const question = await wrongAnsweredQuestion(teacher, lesson.id, null, "Sekme sorusu");

    await loginAs(page, teacher);
    await page.goto("/ogretmen/cozum-bekleyenler?sayfa=9");
    const item = page.locator(`[data-testid="needs-item"][data-question-id="${question.id}"]`);
    await expect(page).not.toHaveURL(/sayfa=/);
    await expect(item).toBeVisible();

    await item.getByRole("button", { name: /Listeden çıkar/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Listeden çıkar" }).click();
    await expect(item).toHaveCount(0);

    await page.getByRole("button", { name: "Çıkarılanlar" }).click();
    await expect(page).toHaveURL(/gorunum=cikarilanlar/);
    await expect(page.getByTestId("threshold-sentence")).not.toContainText("En az");
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: /Listeye geri al/ }).click();
    await expect(item).toHaveCount(0);
    expect(await needsSolutionIds(teacher.token, lesson.id)).toContain(question.id);
    await page.getByRole("button", { name: "Bekleyenler" }).click();
    await expect(item).toBeVisible();
  });

  test("öğrenci listesinde aralık dışı sayfa düzelir ve arama geri gezinmeyle senkron kalır", async ({ page }) => {
    const w = await world();
    const teacher = await branchTeacher(w.lessons[0]!.id);
    await loginAs(page, teacher);
    await page.goto("/ogretmen/ogrenciler?sayfa=999");
    await expect(page.locator('[data-testid="student-row"], [data-testid="student-card"]').locator("visible=true").first()).toBeVisible();
    await expect(page).not.toHaveURL(/sayfa=999/);

    await page.goto("/ogretmen/ogrenciler?ara=ogrenci");
    await expect(page.getByLabel("Öğrenci ara")).toHaveValue("ogrenci");
    await page.getByLabel("Sıralama").selectOption("points");
    await expect(page).toHaveURL(/sirala=puan/);
    await page.getByLabel("Öğrenci ara").fill("havuz");
    await expect(page).toHaveURL(/ara=havuz/);
    await page.goBack();
    await expect(page.getByLabel("Öğrenci ara")).toHaveValue("ogrenci");
  });
});

test.describe("şikâyetler", () => {
  test("liste, filtre, detay ve reddetme kararı", async ({ page }) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const student = await activeUser("ogrenci", "ogrenci");
    const creator = await authorFor(lesson.id);
    const question = await createTextQuestion(creator, lesson.id, `Şikâyet sorusu ${Date.now().toString(36)}: Hangisi doğrudur?`, 2);
    const description = `Soru metni eksik görünüyor ${Date.now().toString(36)}`;
    await reportQuestion(student, question.id, "incomplete", description);

    await loginAs(page, teacher);
    await page.goto("/ogretmen/sikayetler");
    await expect(page.getByRole("heading", { name: "Şikâyetler", level: 1 })).toBeVisible();
    const item = page.getByTestId("report-item").filter({ hasText: description });
    await expect(item).toBeVisible();
    await expectNoAxeViolations(page, "sikayetler-liste");

    await page.getByRole("button", { name: "Reddedilen" }).click();
    await expect(page).toHaveURL(/durum=rejected/);
    await expect(item).toHaveCount(0);
    await page.getByRole("button", { name: "Bekleyen" }).click();
    await expect(page).not.toHaveURL(/durum=/);
    await page.getByLabel("Tür").selectOption("comment");
    await expect(page).toHaveURL(/tur=comment/);
    await expect(item).toHaveCount(0);
    await page.getByLabel("Tür").selectOption("question");
    await expect(item).toBeVisible();

    await item.click();
    await expect(page).toHaveURL(/\/ogretmen\/sikayetler\/\d+$/);
    await expect(page.getByRole("heading", { name: "Şikâyet incelemesi" })).toBeVisible();
    await expect(page.getByTestId("report-description")).toHaveText(description);
    await expect(page.getByTestId("resolve-submit")).toBeDisabled();
    await expectNoAxeViolations(page, "sikayet-detay");

    await page.getByRole("radio", { name: /Şikâyeti reddet/ }).check();
    await page.getByLabel("Not (isteğe bağlı)").fill("Soru eksiksiz.");
    await page.getByTestId("resolve-submit").click();
    await page.getByRole("dialog").getByRole("button", { name: "Uygula" }).click();
    await expect(page.getByTestId("report-outcome")).toContainText("Reddedildi");
    await expect(page.getByTestId("resolve-submit")).toHaveCount(0);

    const pending = await backend<{ items: { description: string }[] }>("GET", "/api/admin/reports?status=pending&pageSize=50", { token: teacher.token });
    expect(pending.body.items.some((entry) => entry.description === description)).toBe(false);
  });

  test("anahtar şikâyeti şüpheli anahtar ekranına bağlanır, başka branşta 403 anlaşılır gösterilir", async ({ page }) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    const otherLesson = w.lessons[1]!;
    const outsider = await branchTeacher(otherLesson.id);
    const student = await activeUser("ogrenci", "ogrenci");
    const creator = await authorFor(lesson.id);
    const question = await createTextQuestion(creator, lesson.id, `Anahtar şikâyeti ${Date.now().toString(36)}: Hangisi doğrudur?`, 2);
    await answerQuestion(student, question.id, 3, validExplanation(w.settings.aciklamaMinKarakter));
    const description = `Anahtar yanlış olmalı ${Date.now().toString(36)}`;
    await reportQuestion(student, question.id, "wrongAnswerKey", description);

    await loginAs(page, outsider);
    await page.goto("/ogretmen/sikayetler");
    await page.getByTestId("report-item").filter({ hasText: description }).click();
    await expect(page.getByTestId("dispute-link")).toHaveAttribute("href", `/ogretmen/supheli-anahtarlar/${question.id}`);

    await page.getByRole("radio", { name: /Şikâyeti reddet/ }).check();
    await page.getByTestId("resolve-submit").click();
    await page.getByRole("dialog").getByRole("button", { name: "Uygula" }).click();
    await expect(page.getByTestId("problem-banner")).toContainText("branş");
    await expect(page.getByTestId("forbidden-hint")).toBeVisible();

    await setBranch(outsider.id, lesson.id);
    await page.reload();
    await page.getByRole("radio", { name: /Cevap anahtarını değiştir/ }).check();
    await page.getByRole("radio", { name: /^D şıkkı/ }).click();
    await page.getByTestId("resolve-submit").click();
    await page.getByRole("dialog").getByRole("button", { name: "Uygula" }).click();
    await expect(page.getByTestId("report-outcome")).toContainText("Cevap anahtarı değiştirildi");
    const view = await backend<{ correctOption: number | null }>("GET", `/api/questions/${question.id}`, { token: outsider.token });
    expect(view.body.correctOption).toBe(4);
  });
});

test.describe("şikâyet çakışması", () => {
  test("başkası önce karar verirse uyarı ve karar sahibi görünür", async ({ page }) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const other = await branchTeacher(lesson.id);
    const student = await activeUser("ogrenci", "ogrenci");
    const creator = await authorFor(lesson.id);
    const question = await createTextQuestion(creator, lesson.id, `Çakışma sorusu ${Date.now().toString(36)}: Hangisi doğrudur?`, 2);
    const description = `Çakışma şikâyeti ${Date.now().toString(36)}`;
    await reportQuestion(student, question.id, "incomplete", description);

    await loginAs(page, teacher);
    await page.goto("/ogretmen/sikayetler");
    await page.getByTestId("report-item").filter({ hasText: description }).click();
    await page.getByRole("radio", { name: /Şikâyeti reddet/ }).check();

    const pending = await backend<{ items: { id: number; description: string; rowVersion: string }[] }>("GET", "/api/admin/reports?status=pending&pageSize=50", { token: other.token });
    const target = pending.body.items.find((entry) => entry.description === description)!;
    const resolved = await backend("POST", `/api/admin/reports/${target.id}/resolve`, { token: other.token, body: { action: "reject", note: null, correctOption: null, rowVersion: target.rowVersion } });
    expect(resolved.status).toBe(200);

    await page.getByTestId("resolve-submit").click();
    await page.getByRole("dialog").getByRole("button", { name: "Uygula" }).click();
    await expect(page.getByTestId("problem-banner")).toBeVisible();
    await expect(page.getByTestId("resolved-by-other")).toContainText("karara bağlanmış");
  });
});

test.describe("öğretmen panosu", () => {
  test("gerçek veriyle kartlar ve bağlantılar", async ({ page }) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const question = await wrongAnsweredQuestion(teacher, lesson.id, null, "Pano sorusu");
    const today = todayInIstanbul();
    const title = `Pano ödevi ${Date.now().toString(36)}`;
    await createOpenAssignment(teacher, lesson.id, title, today, addDaysToDateOnly(today, 3));
    await studentQuestion((await answerPool())[0]!, lesson.id, validExplanation(w.settings.aciklamaMinKarakter));

    await loginAs(page, teacher);
    await expect(page.getByText("Bu sayfa hazırlanıyor")).toHaveCount(0);
    await expect(page.getByTestId("teacher-dashboard")).toBeVisible();
    await expect(page.getByTestId("needs-count")).not.toHaveText("0");
    expect(await needsSolutionIds(teacher.token, lesson.id)).toContain(question.id);
    await expect(page.getByTestId("disputed-count")).toBeVisible();
    await expect(page.getByTestId("reports-count")).toBeVisible();
    await expect(page.getByTestId("assignments-count")).not.toHaveText("0");
    await expect(page.getByTestId("assignment-item").filter({ hasText: title })).toBeVisible();
    await expect(page.getByTestId("top-student").first()).toBeVisible();
    await expect(page.getByTestId("card-topics")).toBeVisible();
    await expect(page.getByTestId("student-question").first()).toBeVisible();
    await expect(page.getByTestId("card-error")).toHaveCount(0);
    await expectNoAxeViolations(page, "ogretmen-pano");

    await page.getByTestId("card-needs-solution").getByRole("link", { name: "Listeye git" }).click();
    await expect(page).toHaveURL(/\/ogretmen\/cozum-bekleyenler$/);
  });
});

test.describe("öğretmen ekranları duyarlı düzen", () => {
  test("375, 768 ve 1280 genişlikte taşma olmaz ve axe temiz", async ({ page }, testInfo) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    const teacher = await branchTeacher(lesson.id);
    const question = await wrongAnsweredQuestion(teacher, lesson.id, null, "Düzen sorusu");
    await loginAs(page, teacher);
    const sizes: (number | null)[] = testInfo.project.name === "webkit-iphone" ? [null] : [375, 768, 1280];
    const routes: { path: string; ready: () => Promise<void> }[] = [
      { path: "/", ready: () => expect(page.getByTestId("reports-count")).toBeVisible() },
      { path: "/ogretmen/ogrenciler", ready: () => expect(page.locator('[data-testid="student-row"], [data-testid="student-card"]').locator("visible=true").first()).toBeVisible() },
      { path: "/ogretmen/cozum-bekleyenler", ready: () => expect(page.locator(`[data-testid="needs-item"][data-question-id="${question.id}"]`)).toBeVisible() },
      { path: "/ogretmen/sikayetler", ready: () => expect(page.getByRole("heading", { name: "Şikâyetler", level: 1 })).toBeVisible() },
    ];
    for (const size of sizes) {
      if (size !== null) await page.setViewportSize({ width: size, height: 900 });
      for (const route of routes) {
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
