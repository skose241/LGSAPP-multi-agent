import { addDaysToDateOnly, formatDateOnly, todayInIstanbul } from "@lgs/api";
import type { Locator, Page } from "@playwright/test";
import { branchTeacher } from "./support/ai";
import { assignmentDetail, createDraftAssignment, pngFile } from "./support/assignment-data";
import { expectNoAxeViolations } from "./support/axe";
import { backend } from "./support/backend";
import { expect, login, test } from "./support/fixtures";
import { brokenPdf, pdfFile, questionRect, type NormalizedRect } from "./support/pdf-fixture";
import type { ActiveUser } from "./support/student-data";
import { world } from "./support/world";

async function loginAs(page: Page, user: ActiveUser) {
  await login(page, user.userName, user.password);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
}

async function lesson() {
  const w = await world();
  return w.lessons[w.lessons.length - 1]!;
}

async function waitUploaded(page: Page, count: number) {
  await expect(page.locator('[data-testid="composer-card"] [data-testid="upload-status"][data-status="done"]')).toHaveCount(count, { timeout: 120_000 });
}

function inside(rect: NormalizedRect): NormalizedRect {
  return { x: rect.x + 0.02, y: rect.y + 0.02, width: rect.width - 0.04, height: rect.height - 0.04 };
}

async function overlayBox(page: Page) {
  const overlay = page.getByTestId("page-overlay");
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error("Çizim alanı bulunamadı.");
  return box;
}

async function dragBetween(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const box = await overlayBox(page);
  await page.mouse.move(box.x + from.x * box.width, box.y + from.y * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + ((from.x + to.x) / 2) * box.width, box.y + ((from.y + to.y) / 2) * box.height, { steps: 4 });
  await page.mouse.move(box.x + to.x * box.width, box.y + to.y * box.height, { steps: 4 });
  await page.mouse.up();
}

async function drawBox(page: Page, rect: NormalizedRect) {
  await dragBetween(page, { x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height });
}

async function styleNumber(box: Locator, property: "left" | "top" | "width" | "height"): Promise<number> {
  return box.evaluate((element, name) => parseFloat((element as HTMLElement).style[name as "left"]), property);
}

async function openPdf(page: Page, pages: number, name = "deneme.pdf") {
  await page.getByTestId("split-pdf-input").setInputFiles(pdfFile(name, { pages }));
  await expect(page.getByTestId("split-workspace")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("page-image")).toBeVisible({ timeout: 60_000 });
}

async function newAssignment(teacherUser: ActiveUser, lessonId: number, label: string) {
  const today = todayInIstanbul();
  return createDraftAssignment(teacherUser, lessonId, `${label} ${Date.now().toString(36)}`, today, addDaysToDateOnly(today, 6));
}

function problem(status: number, detail: string) {
  return { status, headers: { "content-type": "application/problem+json" }, body: JSON.stringify({ title: detail, detail, status }) };
}

test.describe("sayfadan ayır", () => {
  test("ödevde PDF'ten çerçeve çizilir, düzenlenir, cevap anahtarı uygulanır ve sorular ödeve eklenir", async ({ page }) => {
    test.setTimeout(300_000);
    const target = await lesson();
    const teacher = await branchTeacher(target.id);
    const id = await newAssignment(teacher, target.id, "Sayfadan ayır ödevi");
    const pdfRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/pdfjs/")) pdfRequests.push(request.url());
    });
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    await expect(page.getByTestId("assignment-title")).toBeVisible();
    await page.getByRole("button", { name: "Sayfadan Ayır" }).click();
    const panel = page.getByTestId("split-panel");
    await expect(panel.getByTestId("page-splitter")).toBeVisible();
    await expect(panel.getByText("Word ya da PowerPoint")).toBeVisible();
    await page.waitForTimeout(500);
    expect(pdfRequests).toEqual([]);

    await openPdf(page, 2);
    expect(pdfRequests.some((url) => url.includes("pdf.worker.min.mjs"))).toBe(true);
    await expect(page.getByTestId("page-thumb")).toHaveCount(2);
    await expect(page.getByTestId("page-indicator")).toHaveText("Sayfa 1 / 2");

    await drawBox(page, inside(questionRect(0)));
    await drawBox(page, inside(questionRect(2)));
    await drawBox(page, inside(questionRect(4)));
    const boxes = page.getByTestId("split-box");
    await expect(boxes).toHaveCount(3);
    await expect(boxes.nth(0)).toHaveAttribute("data-number", "1");
    await expect(boxes.nth(1)).toHaveAttribute("data-number", "2");
    await expect(boxes.nth(2)).toHaveAttribute("data-number", "3");
    await expect(page.getByTestId("box-row")).toHaveCount(3);

    const second = boxes.nth(1);
    const beforeLeft = await styleNumber(second, "left");
    const beforeTop = await styleNumber(second, "top");
    const secondRect = inside(questionRect(2));
    await dragBetween(page, { x: secondRect.x + 0.1, y: secondRect.y + 0.08 }, { x: secondRect.x + 0.1 - 0.03, y: secondRect.y + 0.08 + 0.02 });
    expect(await styleNumber(second, "left")).toBeLessThan(beforeLeft);
    expect(await styleNumber(second, "top")).toBeGreaterThan(beforeTop);
    await expect(second).toHaveAttribute("data-selected", "true");

    const widthBefore = await styleNumber(second, "width");
    const handle = page.getByTestId("handle-se");
    await expect(handle).toBeVisible();
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error("Tutamaç bulunamadı.");
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 - 20, handleBox.y + handleBox.height / 2 - 10, { steps: 4 });
    await page.mouse.up();
    expect(await styleNumber(second, "width")).toBeLessThan(widthBefore);

    await second.focus();
    await page.keyboard.press("c");
    await expect(second).toHaveAttribute("data-option", "C");
    await page.getByTestId("box-row").nth(0).getByTestId("box-select").click();
    await page.getByTestId("selected-controls").getByRole("radio", { name: "A şıkkı" }).click();
    await expect(boxes.nth(0)).toHaveAttribute("data-option", "A");

    await boxes.nth(2).focus();
    await page.keyboard.press("Delete");
    await expect(boxes).toHaveCount(2);
    await page.getByTestId("box-undo").click();
    await expect(boxes).toHaveCount(3);

    await page.getByTestId("answer-key-open").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("answer-key-text").fill("1A 2C 3D 9B");
    await expect(dialog.getByTestId("answer-key-summary")).toContainText("4 cevap okundu, 3 çerçeve var");
    await dialog.getByTestId("answer-key-apply").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("split-notice")).toContainText("3 çerçeveye cevap uygulandı");
    await expect(page.getByTestId("split-notice")).toContainText("9");
    await expect(boxes.nth(0)).toHaveAttribute("data-option", "A");
    await expect(boxes.nth(1)).toHaveAttribute("data-option", "C");
    await expect(boxes.nth(2)).toHaveAttribute("data-option", "D");

    await page.getByRole("button", { name: "Sonraki Sayfa" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Sayfa 2 / 2");
    await expect(boxes).toHaveCount(0);
    await drawBox(page, inside(questionRect(0)));
    await expect(boxes).toHaveCount(1);
    await expect(boxes.first()).toHaveAttribute("data-number", "4");
    await page.getByRole("button", { name: "Önceki Sayfa" }).click();
    await expectNoAxeViolations(page, "sayfadan-ayir-calisma-alani");

    await page.getByTestId("split-transfer").click();
    const cards = page.getByTestId("composer-card");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0).getByRole("heading", { name: "Soru 1" })).toBeVisible();
    await expect(cards.nth(3).getByRole("heading", { name: "Soru 4" })).toBeVisible();
    await expect(cards.nth(0).getByRole("radio", { name: "A şıkkı" })).toBeChecked();
    await expect(cards.nth(1).getByRole("radio", { name: "C şıkkı" })).toBeChecked();
    await expect(cards.nth(2).getByRole("radio", { name: "D şıkkı" })).toBeChecked();
    await expect(cards.nth(3).getByRole("radio", { name: /şıkkı/ }).first()).not.toBeChecked();
    await expect(page.getByTestId("box-row").filter({ hasText: "Aktarıldı" })).toHaveCount(4);
    await expect(page.getByTestId("split-transfer")).toBeDisabled();
    await page.getByTestId("box-row").nth(0).getByTestId("box-select").click();
    await page.getByTestId("box-merge").click();
    await expect(page.getByTestId("split-notice")).toContainText("Aktarılmış çerçeveler birleştirilemez");
    await expect(page.getByTestId("box-row")).toHaveCount(4);
    await waitUploaded(page, 4);

    await cards.nth(3).getByRole("radio", { name: "B şıkkı" }).click();
    await page.getByTestId("split-panel").getByTestId("composer-submit").click();
    await expect(page.getByTestId("assignment-question")).toHaveCount(4, { timeout: 120_000 });
    const detail = await assignmentDetail(teacher, id);
    expect(detail.questions.map((question) => question.correctOption)).toEqual([1, 3, 4, 2]);
    expect(detail.questions.every((question) => question.imageFileId !== null)).toBe(true);
  });

  test("havuzda planlı yayın tarihiyle PDF'ten ayrılan sorular eklenir", async ({ page }) => {
    test.setTimeout(240_000);
    const target = await lesson();
    const teacher = await branchTeacher(target.id);
    const today = todayInIstanbul();
    const planDate = addDaysToDateOnly(today, 200 + Math.floor(Math.random() * 100));
    await loginAs(page, teacher);
    await page.goto("/ogretmen/soru-ekle");
    await expect(page.getByRole("heading", { name: "Havuza Soru Ekle", level: 1 })).toBeVisible();
    await page.getByLabel("Şu Tarihte Yayınla").check();
    await page.getByLabel("Yayın Tarihi").fill(planDate);
    await page.getByRole("button", { name: "Sayfadan Ayır" }).click();
    await openPdf(page, 1);
    await drawBox(page, inside(questionRect(0)));
    await drawBox(page, inside(questionRect(1)));
    await page.getByTestId("answer-key-open").click();
    await page.getByRole("dialog").getByTestId("answer-key-text").fill("BD");
    await page.getByRole("dialog").getByTestId("answer-key-apply").click();
    await page.getByTestId("split-transfer").click();
    const cards = page.getByTestId("split-panel").getByTestId("composer-card");
    await expect(cards).toHaveCount(2);
    await waitUploaded(page, 2);
    await page.getByTestId("split-panel").getByTestId("composer-submit").click();
    await expect(page.locator('[data-testid="composer-card"][data-phase="created"]')).toHaveCount(2, { timeout: 90_000 });
    await expect(page.getByTestId("planned-item").filter({ hasText: formatDateOnly(planDate) })).toHaveCount(2);
    const scheduled = await backend<{ items: { scheduledPublishDate: string | null; publishedAt: string | null; correctOption: number }[] }>("GET", `/api/questions?scheduled=true&lessonId=${target.id}&pageSize=50`, { token: teacher.token });
    const planned = scheduled.body.items.filter((item) => item.scheduledPublishDate === planDate);
    expect(planned).toHaveLength(2);
    expect(planned.every((item) => item.publishedAt === null)).toBe(true);
  });

  test("25 çerçeve 20'lik partiyle aktarılır, kalanlar sırada bekler, kart kaldırılınca sıradakiler aktarılır", async ({ page }) => {
    test.setTimeout(180_000);
    const target = await lesson();
    const teacher = await branchTeacher(target.id);
    const id = await newAssignment(teacher, target.id, "Parti ödevi");
    await page.route("**/api/files", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill(problem(413, "Dosya en fazla 10 MB olabilir."));
    });
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    await page.getByRole("button", { name: "Sayfadan Ayır" }).click();
    await openPdf(page, 2);
    for (let index = 0; index < 25; index += 1) await page.getByTestId("box-add").click();
    await expect(page.getByTestId("box-row")).toHaveCount(25);
    const transfer = page.getByTestId("split-transfer");
    await expect(transfer).toHaveText("20 Çerçeveyi Kartlara Aktar");
    await transfer.click();
    await expect(page.getByTestId("composer-card")).toHaveCount(20, { timeout: 90_000 });
    await expect(page.getByTestId("split-queued")).toContainText("5 çerçeve sırada");
    await expect(page.getByTestId("box-row").filter({ hasText: "Aktarıldı" })).toHaveCount(20);
    await expect(transfer).toBeDisabled();

    for (let index = 0; index < 3; index += 1) {
      await page.getByTestId("split-panel").getByTestId("card-remove").first().click();
    }
    await expect(page.getByTestId("composer-card")).toHaveCount(17);
    await expect(transfer).toHaveText("Sonraki 3 Çerçeveyi Aktar");
    await transfer.click();
    await expect(page.getByTestId("composer-card")).toHaveCount(20, { timeout: 60_000 });
    await expect(page.getByTestId("split-queued")).toContainText("5 çerçeve sırada");
  });

  test("fotoğraf kaynağında sayfa fotoğrafları çerçevelenir, döndürülür ve aktarılır", async ({ page }) => {
    test.setTimeout(240_000);
    const target = await lesson();
    const teacher = await branchTeacher(target.id);
    const id = await newAssignment(teacher, target.id, "Fotoğraf kaynaklı ödev");
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    await page.getByRole("button", { name: "Sayfadan Ayır" }).click();
    await page.getByTestId("split-photo-input").setInputFiles([pngFile("sayfa-a.png", 1200, 1600), pngFile("sayfa-b.png", 1200, 1600)]);
    await expect(page.getByTestId("split-workspace")).toHaveAttribute("data-source-kind", "image", { timeout: 60_000 });
    await expect(page.getByTestId("page-thumb")).toHaveCount(2);
    await expect(page.getByTestId("page-image")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("page-rotate")).toBeVisible();

    await drawBox(page, { x: 0.1, y: 0.1, width: 0.8, height: 0.3 });
    await expect(page.getByTestId("split-box")).toHaveCount(1);
    await page.getByTestId("page-rotate").click();
    await expect(page.getByTestId("page-image")).toBeVisible();
    const rotated = page.getByTestId("split-box").first();
    expect(await styleNumber(rotated, "width")).toBeCloseTo(30, 0);
    await page.getByTestId("selected-controls").getByRole("radio", { name: "B şıkkı" }).click();
    await page.getByTestId("split-transfer").click();
    await expect(page.getByTestId("composer-card")).toHaveCount(1);
    await expect(page.getByTestId("composer-card").first().getByRole("radio", { name: "B şıkkı" })).toBeChecked();
    await waitUploaded(page, 1);
  });

  test("bozuk PDF, boş PDF, 60 sayfadan uzun PDF ve 20'den fazla fotoğraf anlaşılır hata verir", async ({ page }) => {
    test.setTimeout(240_000);
    const target = await lesson();
    const teacher = await branchTeacher(target.id);
    const id = await newAssignment(teacher, target.id, "Hatalı dosya ödevi");
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    await page.getByRole("button", { name: "Sayfadan Ayır" }).click();
    await page.getByTestId("split-pdf-input").setInputFiles({ name: "bozuk.pdf", mimeType: "application/pdf", buffer: brokenPdf() });
    await expect(page.getByTestId("split-error")).toContainText("geçerli bir PDF değil", { timeout: 60_000 });
    await expect(page.getByTestId("split-workspace")).toHaveCount(0);
    await page.getByTestId("split-pdf-input").setInputFiles({ name: "bos.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
    await expect(page.getByTestId("split-error")).toContainText("boş");
    await page.getByTestId("split-pdf-input").setInputFiles(pdfFile("uzun.pdf", { pages: 61 }));
    await expect(page.getByTestId("split-error")).toContainText("en fazla 60 sayfa", { timeout: 120_000 });
    await expect(page.getByTestId("split-workspace")).toHaveCount(0);
    await page.getByTestId("split-photo-input").setInputFiles(Array.from({ length: 21 }, (_, index) => pngFile(`s-${index}.png`, 400, 300)));
    await expect(page.getByTestId("split-error")).toContainText("En fazla 20 fotoğraf");
  });

  test("yükleme 503 verince kartta Tekrar Dene çıkar ve düzelince tamamlanır", async ({ page }) => {
    test.setTimeout(180_000);
    const target = await lesson();
    const teacher = await branchTeacher(target.id);
    const id = await newAssignment(teacher, target.id, "Yeniden deneme ödevi");
    let healthy = false;
    await page.route("**/api/files", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      if (!healthy) return route.fulfill(problem(503, "Sunucu meşgul."));
      return route.continue();
    });
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    await page.getByRole("button", { name: "Sayfadan Ayır" }).click();
    await openPdf(page, 1);
    await drawBox(page, inside(questionRect(0)));
    await page.getByTestId("selected-controls").getByRole("radio", { name: "A şıkkı" }).click();
    await page.getByTestId("split-transfer").click();
    const status = page.getByTestId("composer-card").getByTestId("upload-status");
    await expect(status).toHaveAttribute("data-status", "failed", { timeout: 60_000 });
    healthy = true;
    await page.getByTestId("composer-card").getByRole("button", { name: "Tekrar Dene" }).click();
    await waitUploaded(page, 1);
    await page.getByTestId("split-panel").getByTestId("composer-submit").click();
    await expect(page.getByTestId("assignment-question")).toHaveCount(1, { timeout: 90_000 });
  });

  test("sayfa yenilenince aynı PDF seçildiğinde taslak geri gelir", async ({ page }) => {
    test.setTimeout(180_000);
    const target = await lesson();
    const teacher = await branchTeacher(target.id);
    const id = await newAssignment(teacher, target.id, "Taslak ödevi");
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    await page.getByRole("button", { name: "Sayfadan Ayır" }).click();
    await openPdf(page, 2, "kalici.pdf");
    await drawBox(page, inside(questionRect(0)));
    await drawBox(page, inside(questionRect(3)));
    await page.getByTestId("answer-key-open").click();
    await page.getByRole("dialog").getByTestId("answer-key-text").fill("CA");
    await page.getByRole("dialog").getByTestId("answer-key-apply").click();
    await expect(page.getByTestId("split-box")).toHaveCount(2);

    page.on("dialog", (dialog) => void dialog.accept());
    await page.reload();
    await page.getByRole("button", { name: "Sayfadan Ayır" }).click();
    await expect(page.getByTestId("split-box")).toHaveCount(0);
    await openPdf(page, 2, "kalici.pdf");
    await expect(page.getByTestId("split-notice")).toContainText("Önceki çalışmanız geri yüklendi");
    await expect(page.getByTestId("split-box")).toHaveCount(2);
    await expect(page.getByTestId("split-box").nth(0)).toHaveAttribute("data-option", "C");
    await expect(page.getByTestId("split-box").nth(1)).toHaveAttribute("data-option", "A");
  });

  test("dokunmatik cihazda Çiz ve Kaydır kipleri çalışır, çerçeve dokunarak seçilir", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "webkit-iphone", "Yalnız dokunmatik projede çalışır.");
    test.setTimeout(180_000);
    const target = await lesson();
    const teacher = await branchTeacher(target.id);
    const id = await newAssignment(teacher, target.id, "Dokunmatik ödev");
    await loginAs(page, teacher);
    await page.goto(`/ogretmen/odevler/${id}`);
    await page.getByRole("button", { name: "Sayfadan Ayır" }).click();
    await openPdf(page, 1);
    const overlay = page.getByTestId("page-overlay");
    await expect(overlay).toHaveAttribute("data-mode", "draw");
    expect(await overlay.evaluate((element) => getComputedStyle(element).touchAction)).toBe("none");
    await page.getByTestId("mode-pan").tap();
    await expect(overlay).toHaveAttribute("data-mode", "pan");
    expect(await overlay.evaluate((element) => getComputedStyle(element).touchAction)).toBe("auto");
    await page.getByTestId("mode-draw").tap();
    await page.getByTestId("box-add").tap();
    const box = page.getByTestId("split-box").first();
    await expect(box).toHaveAttribute("data-selected", "true");
    await overlay.tap({ position: { x: 4, y: 4 } });
    await expect(box).toHaveAttribute("data-selected", "false");
    await box.tap({ position: { x: 10, y: 10 } });
    await expect(box).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("handle-se")).toBeVisible();
  });
});
