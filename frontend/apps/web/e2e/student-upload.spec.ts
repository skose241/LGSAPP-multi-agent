import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page, Route } from "@playwright/test";
import { activeUser, answerQuestion, makePng, uploadQuestionImage, type ActiveUser } from "./support/student-data";
import { backend } from "./support/backend";
import { expect, test } from "./support/fixtures";
import { freshQuestion, studentLogin, validExplanation, world } from "./support/world";

function pngFile(name: string, width = 800, height = 600) {
  return { name, mimeType: "image/png", buffer: makePng(width, height) };
}

function uploadId(route: Route): string | null {
  const text = route.request().postDataBuffer()?.toString("latin1") ?? "";
  return /name="clientUploadId"\r\n\r\n([0-9a-f-]{36})/.exec(text)?.[1] ?? null;
}

interface SentUpload {
  type: string;
  name: string;
  size: number;
  width: number;
  height: number;
}

async function captureUploads(page: Page) {
  await page.addInitScript(() => {
    const holder = window as unknown as { __uploads: SentUploadShape[] };
    interface SentUploadShape {
      type: string;
      name: string;
      size: number;
      width: number;
      height: number;
    }
    holder.__uploads = [];
    const original = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function patched(body?: Document | XMLHttpRequestBodyInit | null) {
      if (body instanceof FormData) {
        const file = body.get("file");
        if (file instanceof File) {
          const entry: SentUploadShape = { type: file.type, name: file.name, size: file.size, width: 0, height: 0 };
          holder.__uploads.push(entry);
          createImageBitmap(file)
            .then((bitmap) => {
              entry.width = bitmap.width;
              entry.height = bitmap.height;
              bitmap.close();
            })
            .catch(() => null);
        }
      }
      return original.call(this, body);
    };
  });
}

async function sentUploads(page: Page): Promise<SentUpload[]> {
  return page.evaluate(() => (window as unknown as { __uploads: SentUpload[] }).__uploads.map((entry) => ({ ...entry })));
}

function problem(status: number, detail: string, headers: Record<string, string> = {}, errors?: Record<string, string[]>) {
  return {
    status,
    headers: { "content-type": "application/problem+json", ...headers },
    body: JSON.stringify({ title: detail, detail, status, ...(errors ? { errors } : {}) }),
  };
}

async function fill(card: Locator, lessonName: string, option: string, description: string) {
  await card.getByLabel(/^Ders\*?$/).selectOption({ label: lessonName });
  await card.getByRole("radio", { name: `${option} şıkkı` }).click();
  await card.getByLabel(/^Nerede takıldın/).fill(description);
}

async function waitUploaded(page: Page, count: number) {
  await expect(page.locator('[data-testid="upload-card"] [data-testid="upload-status"][data-status="done"]')).toHaveCount(count, { timeout: 30_000 });
}

async function axeClean(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(
    results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) })),
    `axe ${label}`,
  ).toEqual([]);
}

async function hideQuestionViaReport(questionId: number, reporter: ActiveUser, teacher: ActiveUser) {
  await answerQuestion(reporter, questionId, 1, validExplanation(40));
  const reported = await backend("POST", `/api/questions/${questionId}/reports`, {
    token: reporter.token,
    body: { reason: "inappropriate", description: "Bu soru uygunsuz içerik barındırıyor, lütfen incelenmesi gerekiyor." },
  });
  if (reported.status !== 201 && reported.status !== 200) throw new Error(`Şikâyet oluşmadı: ${reported.status} ${JSON.stringify(reported.body)}`);
  const list = await backend<{ items: { id: number; questionId: number | null; rowVersion: string }[] }>("GET", "/api/admin/reports?status=pending&pageSize=50", { token: teacher.token });
  const report = list.body.items.find((item) => item.questionId === questionId);
  if (!report) throw new Error("Şikâyet listede yok.");
  const resolved = await backend("POST", `/api/admin/reports/${report.id}/resolve`, {
    token: teacher.token,
    body: { action: "hideContent", note: "Uygunsuz bulundu.", correctOption: null, rowVersion: report.rowVersion },
  });
  if (resolved.status !== 200) throw new Error(`Gizlenemedi: ${resolved.status} ${JSON.stringify(resolved.body)}`);
}

async function studentQuestionViaApi(student: ActiveUser, lessonId: number, description: string) {
  const fileId = await uploadQuestionImage(student);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await backend<{ id: number }>("POST", "/api/questions", {
      token: student.token,
      body: {
        lessonId,
        topicId: null,
        text: null,
        imageFileId: fileId,
        optionA: null,
        optionB: null,
        optionC: null,
        optionD: null,
        correctOption: 2,
        description,
        scheduledPublishDate: null,
      },
    });
    if (result.status === 201) return result.body.id;
    if (result.status !== 429) throw new Error(`Soru yüklenemedi: ${result.status} ${JSON.stringify(result.body)}`);
    await new Promise((resolve) => setTimeout(resolve, 6500));
  }
  throw new Error("Soru yüklenemedi: hız sınırı");
}

test.describe("soru yükleme", () => {
  test("5 fotoğraf en fazla 3 eşzamanlı yüklenir ve istemcide 2000 px JPEG'e küçültülür", async ({ page }) => {
    await studentLogin(page);
    await captureUploads(page);
    await page.goto("/soru-yukle");
    await expect(page.getByTestId("quota")).toContainText("0 / 20");

    let inflight = 0;
    let maxInflight = 0;
    let served = 0;
    await page.route("**/api/files", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((resolve) => setTimeout(resolve, 700));
      inflight -= 1;
      served += 1;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 9000 + served, purpose: "questionImage", contentType: "image/jpeg", sizeBytes: 1, width: 2, height: 2, url: "x", urlExpiresAt: "2030-01-01T00:00:00Z" }),
      });
    });

    await page.getByTestId("photo-input").setInputFiles([
      pngFile("buyuk.png", 2400, 1800),
      pngFile("b.png"),
      pngFile("c.png"),
      pngFile("d.png"),
      pngFile("e.png"),
    ]);
    await expect(page.getByTestId("upload-card")).toHaveCount(5);
    await waitUploaded(page, 5);

    expect(maxInflight).toBe(3);
    await expect.poll(async () => (await sentUploads(page)).filter((entry) => entry.width > 0).length).toBe(5);
    const sent = await sentUploads(page);
    expect(sent).toHaveLength(5);
    expect(sent.find((entry) => entry.width === 2000)?.height).toBe(1500);
    expect(sent.filter((entry) => entry.width === 800 && entry.height === 600)).toHaveLength(4);
    for (const entry of sent) {
      expect(entry.type).toBe("image/jpeg");
      expect(entry.name).toBe("foto.jpg");
      expect(entry.size).toBeLessThan(10 * 1024 * 1024);
    }
  });

  test("çoklu fotoğraf (5) yüklenir, doldurulur ve hepsi gönderilir", async ({ page }) => {
    const w = await world();
    const lesson = w.lessons[0]!;
    await studentLogin(page);
    await page.goto("/soru-yukle");
    await expect(page.getByTestId("quota")).toContainText("0 / 20");
    await page.getByTestId("photo-input").setInputFiles([
      pngFile("a.png", 1200, 900),
      pngFile("b.png"),
      pngFile("c.png"),
      pngFile("d.png"),
      pngFile("e.png"),
    ]);
    await expect(page.getByTestId("upload-card")).toHaveCount(5);
    await waitUploaded(page, 5);

    const submit = page.getByTestId("submit-questions");
    await expect(submit).toContainText("5 soruyu gönder");
    const cards = page.getByTestId("upload-card");
    for (let index = 0; index < 5; index += 1) {
      await fill(cards.nth(index), lesson.name, "ABCDA"[index]!, `${index + 1}. soruda ${validExplanation(w.settings.aciklamaMinKarakter)}`);
    }
    await submit.click();
    await expect(page.locator('[data-testid="upload-card"][data-phase="created"]')).toHaveCount(5, { timeout: 30_000 });
    await expect(page.getByTestId("quota")).toContainText("5 / 20");
    await expect(page.getByTestId("quota-remaining")).toHaveText("15");

    const mine = (await (await page.request.get("/api/questions/mine")).json()) as { totalCount: number; items: { image: { width: number; height: number } | null }[] };
    expect(mine.totalCount).toBe(5);
    expect(mine.items.every((item) => item.image !== null)).toBe(true);
  });

  test("kısmi bilgi: eksik kart gönderilmez, hazır olan gönderilir", async ({ page }) => {
    const w = await world();
    await studentLogin(page);
    await page.goto("/soru-yukle");
    await page.getByTestId("photo-input").setInputFiles([pngFile("a.png"), pngFile("b.png")]);
    await waitUploaded(page, 2);
    const cards = page.getByTestId("upload-card");
    await fill(cards.nth(0), w.lessons[0]!.name, "B", validExplanation(w.settings.aciklamaMinKarakter));
    await page.getByTestId("submit-questions").click();
    await expect(page.locator('[data-testid="upload-card"][data-phase="created"]')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId("upload-notice")).toContainText("1 fotoğraf gönderilmedi");
    const remaining = page.locator('[data-testid="upload-card"][data-phase="editing"]');
    await expect(remaining).toHaveCount(1);
    await expect(remaining.getByText("Dersi seç.")).toBeVisible();
    await expect(remaining.getByText("Doğru şıkkı seç.")).toBeVisible();
  });

  test("503'te 1 sn ve 3 sn bekleyip aynı clientUploadId ile yeniden dener", async ({ page }) => {
    await studentLogin(page);
    await page.goto("/soru-yukle");
    const ids: (string | null)[] = [];
    const times: number[] = [];
    let calls = 0;
    await page.route("**/api/files", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      calls += 1;
      ids.push(uploadId(route));
      times.push(Date.now());
      if (calls <= 2) return route.fulfill(problem(503, "Sunucu meşgul."));
      return route.continue();
    });
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    await expect(page.getByTestId("upload-message")).toContainText("yeniden denenecek", { timeout: 10_000 });
    await waitUploaded(page, 1);

    expect(calls).toBe(3);
    expect(ids[0]).not.toBeNull();
    expect(new Set(ids).size).toBe(1);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(900);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(2800);
  });

  test("sürekli 503: 4 deneme sonra Tekrar dene ve Kaldır görünür, elle deneme aynı kimliği kullanır", async ({ page }) => {
    await studentLogin(page);
    await page.goto("/soru-yukle");
    const ids: (string | null)[] = [];
    let healthy = false;
    await page.route("**/api/files", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      ids.push(uploadId(route));
      if (!healthy) return route.fulfill(problem(503, "Sunucu meşgul."));
      return route.continue();
    });
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    const card = page.getByTestId("upload-card");
    await expect(card.getByTestId("upload-status")).toHaveAttribute("data-status", "failed", { timeout: 30_000 });
    expect(ids).toHaveLength(4);
    await expect(card.getByTestId("upload-message")).toContainText("Sunucuya şu an ulaşılamıyor");
    await expect(card.getByRole("button", { name: "Tekrar dene" })).toBeVisible();
    await expect(card.getByRole("button", { name: /kaldır/i })).toBeVisible();

    healthy = true;
    await card.getByRole("button", { name: "Tekrar dene" }).click();
    await waitUploaded(page, 1);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(1);
  });

  test("429 Retry-After sabit gecikmenin yerine kullanılır", async ({ page }) => {
    await studentLogin(page);
    await page.goto("/soru-yukle");
    const times: number[] = [];
    await page.route("**/api/files", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      times.push(Date.now());
      if (times.length === 1) return route.fulfill(problem(429, "Lütfen bekleyin.", { "retry-after": "3" }));
      return route.continue();
    });
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    await waitUploaded(page, 1);
    expect(times).toHaveLength(2);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(2800);
  });

  test("400'de tekrar denenmez ve backend mesajı gösterilir", async ({ page }) => {
    await studentLogin(page);
    await page.goto("/soru-yukle");
    let calls = 0;
    await page.route("**/api/files", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      calls += 1;
      return route.fulfill(problem(400, "Bir veya daha fazla doğrulama hatası oluştu.", {}, { file: ["Fotoğraf okunamadı veya bozuk."] }));
    });
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    const card = page.getByTestId("upload-card");
    await expect(card.getByTestId("upload-status")).toHaveAttribute("data-status", "failed", { timeout: 10_000 });
    await expect(card.getByTestId("upload-message")).toHaveText("Fotoğraf okunamadı veya bozuk.");
    await page.waitForTimeout(4500);
    expect(calls).toBe(1);
    await expect(card.getByRole("button", { name: "Tekrar dene" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: /kaldır/i })).toBeVisible();
    await card.getByRole("button", { name: /kaldır/i }).click();
    await expect(page.getByTestId("upload-card")).toHaveCount(0);
  });

  test("413'te tekrar denenmez", async ({ page }) => {
    await studentLogin(page);
    await page.goto("/soru-yukle");
    let calls = 0;
    await page.route("**/api/files", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      calls += 1;
      return route.fulfill(problem(413, "Dosya en fazla 10 MB olabilir."));
    });
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    await expect(page.getByTestId("upload-message")).toHaveText("Dosya en fazla 10 MB olabilir.", { timeout: 10_000 });
    await page.waitForTimeout(2500);
    expect(calls).toBe(1);
  });

  test("HEIC dosyası tembel heic-to yoluna girer, dönüştürülemezse anlaşılır mesaj verir ve yüklenmez", async ({ page }) => {
    await studentLogin(page);
    await page.goto("/soru-yukle");
    let uploads = 0;
    let heicChunk = false;
    page.on("response", (response) => {
      if (/heic/i.test(response.url()) && response.url().includes("_next")) heicChunk = true;
    });
    await page.route("**/api/files", async (route) => {
      if (route.request().method() === "POST") uploads += 1;
      return route.continue();
    });
    await page.getByTestId("photo-input").setInputFiles({ name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: Buffer.from("bu gecerli bir heic degil, sadece deneme icerigi") });
    const card = page.getByTestId("upload-card");
    await expect(card.getByTestId("upload-message")).toContainText("HEIC", { timeout: 30_000 });
    await expect(card.getByTestId("upload-message")).toContainText("JPEG");
    expect(uploads).toBe(0);
    expect(heicChunk).toBe(true);
  });

  test("sayfadan ayrılma: uygulama içi bağlantıda onay istenir, vazgeçilirse sayfada kalınır", async ({ page }) => {
    await studentLogin(page);
    await page.goto("/soru-yukle");
    const messages: string[] = [];
    let accept = false;
    page.on("dialog", async (dialog) => {
      messages.push(dialog.message());
      if (accept) await dialog.accept();
      else await dialog.dismiss();
    });
    let hold = true;
    const released: (() => void)[] = [];
    await page.route("**/api/files", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      if (hold) {
        await new Promise<void>((resolve) => released.push(resolve));
        return route.abort().catch(() => null);
      }
      return route.continue();
    });
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    await expect(page.getByTestId("upload-status")).toHaveAttribute("data-status", "uploading", { timeout: 15_000 });

    await page.getByRole("link", { name: "Sorularım" }).first().click();
    await expect.poll(() => messages.length).toBe(1);
    expect(messages[0]).toContain("Yükleme sürüyor");
    await expect(page).toHaveURL(/\/soru-yukle$/);

    accept = true;
    await page.getByRole("link", { name: "Sorularım" }).first().click();
    await expect(page).toHaveURL(/\/sorularim$/);
    hold = false;
    for (const release of released) release();
  });

  test("iptal sürmekte olan yüklemeyi keser, Tekrar dene ile tamamlanır", async ({ page }) => {
    await studentLogin(page);
    await page.goto("/soru-yukle");
    let hold = true;
    const released: (() => void)[] = [];
    await page.route("**/api/files", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      if (hold) {
        await new Promise<void>((resolve) => released.push(resolve));
        return route.abort().catch(() => null);
      }
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 9100, purpose: "questionImage", contentType: "image/jpeg", sizeBytes: 1, width: 2, height: 2, url: "x", urlExpiresAt: "2030-01-01T00:00:00Z" }),
      });
    });
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    const card = page.getByTestId("upload-card");
    await expect(card.getByTestId("upload-status")).toHaveAttribute("data-status", "uploading", { timeout: 15_000 });
    const progress = card.getByRole("progressbar");
    await expect(progress).toHaveAttribute("aria-valuemin", "0");
    await expect(progress).toHaveAttribute("aria-valuemax", "100");

    const prevented = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);

    await card.getByRole("button", { name: "İptal" }).click();
    await expect(card.getByTestId("upload-message")).toHaveText("Yükleme iptal edildi");
    hold = false;
    for (const release of released) release();
    await card.getByRole("button", { name: "Tekrar dene" }).click();
    await waitUploaded(page, 1);

    const clean = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(clean).toBe(false);
  });

  test("çevrimdışı uyarısı görünür ve bağlantı gelince kaybolur", async ({ page }) => {
    await studentLogin(page);
    await page.goto("/soru-yukle");
    await expect(page.getByTestId("offline-banner")).toHaveCount(0);
    await page.evaluate(() => {
      Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false });
      window.dispatchEvent(new Event("offline"));
    });
    await expect(page.getByTestId("offline-banner")).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => true });
      window.dispatchEvent(new Event("online"));
    });
    await expect(page.getByTestId("offline-banner")).toHaveCount(0);
  });

  test("günlük sınır 429'u (Retry-After yok) kalan kartları korur ve mesaj gösterir", async ({ page }) => {
    const w = await world();
    await studentLogin(page);
    await page.goto("/soru-yukle");
    await page.route("**/api/questions", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill(problem(429, "Günlük soru yükleme sınırına ulaştınız."));
    });
    await page.getByTestId("photo-input").setInputFiles([pngFile("a.png"), pngFile("b.png")]);
    await waitUploaded(page, 2);
    const cards = page.getByTestId("upload-card");
    await fill(cards.nth(0), w.lessons[0]!.name, "A", validExplanation(w.settings.aciklamaMinKarakter));
    await fill(cards.nth(1), w.lessons[0]!.name, "C", validExplanation(w.settings.aciklamaMinKarakter));
    await page.getByTestId("submit-questions").click();
    await expect(page.getByTestId("limit-message")).toHaveText("Günlük soru yükleme sınırına ulaştınız.");
    await expect(page.locator('[data-testid="upload-card"][data-phase="editing"]')).toHaveCount(2);
    await expect(page.getByTestId("submit-questions")).toBeEnabled();
  });

  test("soru oluşturmada Retry-After'lı 429 geri sayımla beklenir ve devam edilir", async ({ page }) => {
    const w = await world();
    await studentLogin(page);
    await page.goto("/soru-yukle");
    let calls = 0;
    await page.route("**/api/questions", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      calls += 1;
      if (calls === 1) return route.fulfill(problem(429, "Lütfen bekleyin.", { "retry-after": "2" }));
      return route.continue();
    });
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    await waitUploaded(page, 1);
    await fill(page.getByTestId("upload-card"), w.lessons[0]!.name, "D", validExplanation(w.settings.aciklamaMinKarakter));
    await page.getByTestId("submit-questions").click();
    await expect(page.getByTestId("cooldown")).toBeVisible();
    await expect(page.locator('[data-testid="upload-card"][data-phase="created"]')).toHaveCount(1, { timeout: 20_000 });
    expect(calls).toBe(2);
  });

  test("ağ hatasından sonra kart tekrar gönderilebilir", async ({ page }) => {
    const w = await world();
    await studentLogin(page);
    await page.goto("/soru-yukle");
    let calls = 0;
    await page.route("**/api/questions", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      calls += 1;
      if (calls === 1) return route.abort("failed");
      return route.continue();
    });
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    await waitUploaded(page, 1);
    const card = page.getByTestId("upload-card");
    await fill(card, w.lessons[0]!.name, "B", validExplanation(w.settings.aciklamaMinKarakter));
    await page.getByTestId("submit-questions").click();
    await expect(card.getByTestId("card-error")).toContainText("Bağlantı kurulamadı");
    await page.getByTestId("submit-questions").click();
    await expect(page.locator('[data-testid="upload-card"][data-phase="created"]')).toHaveCount(1, { timeout: 20_000 });
    const mine = (await (await page.request.get("/api/questions/mine")).json()) as { totalCount: number };
    expect(mine.totalCount).toBe(1);
  });

  test("öğretmen bu sayfada yönlendirilir", async ({ page }) => {
    const { login } = await import("./support/fixtures");
    const teacher = await activeUser("ogretmen", "hocayuk");
    await login(page, teacher.userName, teacher.password);
    await page.goto("/soru-yukle");
    await expect(page.getByRole("heading", { name: "Bu sayfa öğrenciler için" })).toBeVisible();
  });
});

test.describe("günlük hak ve idempotent gönderim", () => {
  test("puanlı hak cümlesi sayfada ve panoda me/stats'tan gösterilir ve gönderimden sonra güncellenir", async ({ page }) => {
    const w = await world();
    await studentLogin(page);
    const before = (await (await page.request.get("/api/me/stats")).json()) as {
      uploadToday: { dailyLimit: number; scoredLimit: number; scoredRemaining: number; pointsPerQuestion: number };
    };
    const upload = before.uploadToday;
    await expect(page.getByTestId("dashboard-upload-quota")).toContainText(`0 / ${upload.dailyLimit} soru yükledin`);

    await page.goto("/soru-yukle");
    if (upload.scoredLimit > 0) {
      await expect(page.getByTestId("quota-scored")).toContainText(`İlk ${upload.scoredLimit} soru puanlı. ${upload.scoredRemaining} puanlı hakkın kaldı.`);
    } else {
      await expect(page.getByTestId("quota-scored")).toHaveCount(0);
    }
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    await waitUploaded(page, 1);
    await fill(page.getByTestId("upload-card"), w.lessons[0]!.name, "C", validExplanation(w.settings.aciklamaMinKarakter));
    await page.getByTestId("submit-questions").click();
    await expect(page.locator('[data-testid="upload-card"][data-phase="created"]')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId("quota")).toContainText(`1 / ${upload.dailyLimit}`);
    if (upload.scoredLimit > 0) {
      await expect(page.getByTestId("quota-scored")).toContainText(`${Math.max(0, upload.scoredRemaining - 1)} puanlı hakkın kaldı`);
    }
    await page.goto("/");
    await expect(page.getByTestId("dashboard-upload-quota")).toContainText(`1 / ${upload.dailyLimit} soru yükledin`);
  });

  test("ilk istek yanıtı kaybolursa aynı clientRequestId ile tekrar gönderim tek soru oluşturur", async ({ page }) => {
    const w = await world();
    await studentLogin(page);
    await page.goto("/soru-yukle");
    const ids: (string | null)[] = [];
    let calls = 0;
    await page.route("**/api/questions", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      calls += 1;
      ids.push((route.request().postDataJSON() as { clientRequestId?: string }).clientRequestId ?? null);
      if (calls === 1) {
        await route.fetch();
        return route.abort("failed");
      }
      return route.continue();
    });
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    await waitUploaded(page, 1);
    const card = page.getByTestId("upload-card");
    await fill(card, w.lessons[0]!.name, "B", validExplanation(w.settings.aciklamaMinKarakter));
    await page.getByTestId("submit-questions").click();
    await expect(card.getByTestId("card-error")).toContainText("Bağlantı kurulamadı");

    await page.getByTestId("submit-questions").click();
    await expect(page.locator('[data-testid="upload-card"][data-phase="created"]')).toHaveCount(1, { timeout: 20_000 });
    expect(calls).toBe(2);
    expect(ids[0]).not.toBeNull();
    expect(ids[1]).toBe(ids[0]);

    const mine = (await (await page.request.get("/api/questions/mine")).json()) as { totalCount: number };
    expect(mine.totalCount).toBe(1);
    const stats = (await (await page.request.get("/api/me/stats")).json()) as { uploadToday: { uploaded: number } };
    expect(stats.uploadToday.uploaded).toBe(1);
  });

  test("kart içeriği değişince yeni clientRequestId kullanılır, değişmezse aynısı", async ({ page }) => {
    const w = await world();
    await studentLogin(page);
    await page.goto("/soru-yukle");
    const ids: (string | null)[] = [];
    await page.route("**/api/questions", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      ids.push((route.request().postDataJSON() as { clientRequestId?: string }).clientRequestId ?? null);
      return route.fulfill(problem(422, "İçerik uyuşmuyor."));
    });
    await page.getByTestId("photo-input").setInputFiles(pngFile("a.png"));
    await waitUploaded(page, 1);
    const card = page.getByTestId("upload-card");
    await fill(card, w.lessons[0]!.name, "B", validExplanation(w.settings.aciklamaMinKarakter));
    await page.getByTestId("submit-questions").click();
    await expect(card.getByTestId("card-error")).toContainText("İçerik uyuşmuyor.");
    await page.getByTestId("submit-questions").click();
    await expect.poll(() => ids.length).toBe(2);
    expect(ids[1]).toBe(ids[0]);
    await card.getByLabel(/^Nerede takıldın/).fill(`${validExplanation(w.settings.aciklamaMinKarakter)} ek`);
    await page.getByTestId("submit-questions").click();
    await expect.poll(() => ids.length).toBe(3);
    expect(ids[2]).not.toBe(ids[1]);
  });
});

test.describe("cevaplamadan şikâyet", () => {
  test("cevapsız öğrenci okunaksız nedeniyle şikâyet eder, yanlış anahtar seçilemez, doğru şık görünmez", async ({ page }) => {
    const { question } = await freshQuestion(`Cevapsız şikâyet ${Date.now().toString(36)}`, 3);
    await studentLogin(page);
    await page.goto(`/sorular/${question.id}`);

    await page.getByRole("button", { name: "Soruyu şikâyet et" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Yanlış cevap anahtarı şikâyeti için önce soruyu cevaplamalısın.")).toBeVisible();
    const wrong = dialog.getByRole("option", { name: "Cevap anahtarı yanlış" });
    await expect(wrong).toBeDisabled();
    await expect(dialog.getByLabel("Neden")).not.toHaveValue("wrongAnswerKey");

    await dialog.getByLabel("Neden").selectOption("unreadable");
    await dialog.getByLabel("Açıklama").fill("Fotoğraf okunamıyor, şıklar kesilmiş görünüyor.");
    const reported = page.waitForResponse((response) => response.url().includes(`/api/questions/${question.id}/reports`) && response.request().method() === "POST");
    await dialog.getByRole("button", { name: "Şikâyet et" }).click();
    expect((await reported).status()).toBe(201);
    await expect(page.getByText("Şikâyetin öğretmenlere iletildi.")).toBeVisible();

    await expect(page.getByTestId("answer-result")).toHaveCount(0);
    await expect(page.getByText(/Doğru cevap:/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cevabı Gönder" })).toBeVisible();
    const detail = (await (await page.request.get(`/api/questions/${question.id}`)).json()) as { correctOption: number | null; myAnswer: unknown };
    expect(detail.correctOption).toBeNull();
    expect(detail.myAnswer).toBeNull();
  });

  test("cevap verdikten sonra yanlış anahtar nedeni seçilebilir", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Cevaplı şikâyet ${Date.now().toString(36)}`, 2);
    const student = await studentLogin(page);
    await answerQuestion(student, question.id, 1, validExplanation(w.settings.aciklamaMinKarakter));
    await page.goto(`/sorular/${question.id}`);
    await page.getByRole("button", { name: "Soruyu şikâyet et" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("option", { name: "Cevap anahtarı yanlış" })).toBeEnabled();
    await expect(dialog.getByText("önce soruyu cevaplamalısın")).toHaveCount(0);
    await expect(dialog.getByLabel("Neden")).toHaveValue("wrongAnswerKey");
  });
});

test.describe("gizli soru", () => {
  test("yazar öğrenci gizlenen sorusunu salt okunur görür, alt uçlar çağrılmaz", async ({ page }) => {
    const w = await world();
    const author = await studentLogin(page);
    const questionId = await studentQuestionViaApi(author, w.lessons[0]!.id, validExplanation(w.settings.aciklamaMinKarakter));
    const reporter = await activeUser("ogrenci", "sikayetci");
    await hideQuestionViaReport(questionId, reporter, w.teacher);

    const calls: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (new RegExp(`/api/questions/${questionId}/(answers|comments|likes?|reports|solutions)`).test(path)) calls.push(path);
    });

    await page.goto("/sorularim");
    await expect(page.locator(`[data-question-id="${questionId}"] [data-testid="my-question-status"]`)).toHaveText("Gizlendi");
    await page.locator(`[data-question-id="${questionId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/sorular/${questionId}$`));

    const banner = page.getByTestId("hidden-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Bu soru gizlendi (");
    await expect(page.getByRole("heading", { name: "Cevapla" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Çözümler" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Tartışma kilitli" })).toHaveCount(0);
    await expect(page.getByTestId("like-button")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Soruyu şikâyet et" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cevabı Gönder" })).toHaveCount(0);
    await expect(page.locator("img[alt$='sorusu']").first()).toBeVisible();
    await page.waitForTimeout(800);
    expect(calls).toEqual([]);
    await axeClean(page, "gizli soru");
  });
});

test.describe("sorularım", () => {
  test("yüklenen sorular küçük resim ve durumla listelenir, karta tıklanınca detay açılır", async ({ page }) => {
    const w = await world();
    const student = await studentLogin(page);
    const first = await studentQuestionViaApi(student, w.lessons[0]!.id, validExplanation(w.settings.aciklamaMinKarakter));
    await studentQuestionViaApi(student, w.lessons[0]!.id, validExplanation(w.settings.aciklamaMinKarakter));
    await page.goto("/sorularim");

    const cards = page.getByTestId("my-question");
    await expect(cards).toHaveCount(2);
    await expect(cards.first().getByTestId("my-question-status")).toHaveText("Yayında");
    const image = cards.first().locator("img").first();
    await expect(image).toBeVisible();
    expect(await image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.locator(`[data-question-id="${first}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/sorular/${first}$`));
  });

  test("sayfalama sayfa parametresini ister ve gizlenen soru bağlantısız gösterilir", async ({ page }) => {
    await studentLogin(page);
    const requested: string[] = [];
    const item = (id: number, hidden: boolean) => ({
      id,
      lesson: { id: 1, name: "Matematik" },
      topic: null,
      image: null,
      createdAt: "2026-11-16T10:00:00Z",
      publishedAt: "2026-11-16T10:00:00Z",
      scheduledPublishDate: null,
      isHidden: hidden,
      answerCount: 3,
      correctCount: 2,
    });
    await page.route("**/api/questions/mine**", async (route) => {
      const url = new URL(route.request().url());
      requested.push(url.searchParams.get("page") ?? "");
      const pageNumber = Number(url.searchParams.get("page") ?? "1");
      const items = Array.from({ length: 12 }, (_, index) => item(pageNumber * 100 + index, pageNumber === 1 && index === 0));
      return route.fulfill({ json: { page: pageNumber, pageSize: 12, totalCount: 30, items } });
    });
    await page.goto("/sorularim");
    await expect(page.getByTestId("page-info")).toHaveText("1–12 / 30");
    await expect(page.locator('[data-question-id="100"]')).toHaveAttribute("href", "/sorular/100");
    await expect(page.locator('[data-question-id="100"] [data-testid="my-question-status"]')).toHaveText("Gizlendi");
    await expect(page.locator('[data-question-id="101"]')).toHaveJSProperty("tagName", "A");
    await page.getByRole("button", { name: "Sayfa 2" }).click();
    await expect(page).toHaveURL(/sayfa=2/);
    await expect(page.getByTestId("page-info")).toHaveText("13–24 / 30");
    expect(requested).toContain("2");
  });

  test("boş durumda yükleme çağrısı gösterilir", async ({ page }) => {
    await studentLogin(page);
    await page.goto("/sorularim");
    await expect(page.getByRole("heading", { name: "Henüz soru yüklemedin" })).toBeVisible();
    await page.getByRole("link", { name: "Soru yükle" }).last().click();
    await expect(page).toHaveURL(/\/soru-yukle$/);
  });

  test("pano soru yükle ve sorularım bağlantılarını içerir", async ({ page }) => {
    await studentLogin(page);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sorularım" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Soru yükle" }).first()).toBeVisible();
  });
});

test.describe("görselli çözüm", () => {
  test("yalnız fotoğrafla cevap verilir, düzenlemede görsel değiştirilir ve kaldırılır", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Görselli çözüm ${Date.now().toString(36)}`, 2);
    await studentLogin(page);
    await page.goto(`/sorular/${question.id}`);

    const submit = page.getByRole("button", { name: "Cevabı Gönder" });
    await page.getByRole("radio", { name: "B şıkkı" }).click();
    await expect(submit).toBeDisabled();
    await page.getByTestId("photo-input").setInputFiles(pngFile("cozum.png"));
    await expect(page.getByTestId("upload-status")).toHaveAttribute("data-status", "done", { timeout: 30_000 });
    await expect(page.getByTestId("answer-counter")).toContainText("isteğe bağlı");
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByTestId("answer-result")).toContainText("Doğru cevap!");
    const mine = page.getByTestId("solution").filter({ hasText: "(Sen)" });
    await expect(mine.locator("img[alt='Çözüm görseli']")).toBeVisible();

    await mine.getByTestId("solution-edit").click();
    await page.getByTestId("photo-input").setInputFiles(pngFile("yeni.png", 640, 480));
    await expect(page.getByTestId("upload-status")).toHaveAttribute("data-status", "done", { timeout: 30_000 });
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(mine.getByTestId("solution-edited")).toBeVisible();
    const afterReplace = (await (await page.request.get(`/api/questions/${question.id}/solutions`)).json()) as { items: { isMine: boolean; imageFileId: number | null }[] };
    const replacedId = afterReplace.items.find((item) => item.isMine)?.imageFileId ?? null;
    expect(replacedId).not.toBeNull();

    await mine.getByTestId("solution-edit").click();
    await page.getByRole("button", { name: "Fotoğrafı kaldır" }).click();
    const save = page.getByRole("button", { name: "Kaydet" });
    await expect(save).toBeDisabled();
    await expect(page.getByTestId("edit-counter")).toContainText(`en az ${w.settings.aciklamaMinKarakter}`);
    await page.getByLabel("Çözümü düzenle").fill(validExplanation(w.settings.aciklamaMinKarakter));
    await expect(save).toBeEnabled();
    await save.click();
    await expect(mine.getByTestId("solution-edit")).toBeVisible();
    await expect(mine.locator("img[alt='Çözüm görseli']")).toHaveCount(0);

    const afterRemove = (await (await page.request.get(`/api/questions/${question.id}/solutions`)).json()) as { items: { isMine: boolean; imageFileId: number | null }[] };
    expect(afterRemove.items.find((item) => item.isMine)?.imageFileId).toBeNull();
  });

  test("metin ve fotoğraf birlikte gönderilir; fotoğrafsız kısa metin reddedilir", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Metin ve görsel ${Date.now().toString(36)}`, 1);
    await studentLogin(page);
    await page.goto(`/sorular/${question.id}`);
    const submit = page.getByRole("button", { name: "Cevabı Gönder" });
    await page.getByRole("radio", { name: "A şıkkı" }).click();
    await page.getByLabel(/^Çözümünü anlat/).fill("kısa");
    await expect(submit).toBeDisabled();
    await page.getByTestId("photo-input").setInputFiles(pngFile("cozum.png"));
    await expect(page.getByTestId("upload-status")).toHaveAttribute("data-status", "done", { timeout: 30_000 });
    await expect(submit).toBeEnabled();
    await page.getByRole("button", { name: "Fotoğrafı kaldır" }).click();
    await expect(submit).toBeDisabled();
    await page.getByLabel(/^Çözümünü anlat/).fill(validExplanation(w.settings.aciklamaMinKarakter));
    await expect(submit).toBeEnabled();
  });

  test("görselli çözüm mevcut API ile oluşturulup düzenleme ekranında gösterilir", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Mevcut görsel ${Date.now().toString(36)}`, 3);
    const student = await studentLogin(page);
    const imageId = await uploadQuestionImage(student, "solutionImage");
    await answerQuestion(student, question.id, 3, validExplanation(w.settings.aciklamaMinKarakter), imageId);
    await page.goto(`/sorular/${question.id}`);
    const mine = page.getByTestId("solution").filter({ hasText: "(Sen)" });
    await mine.getByTestId("solution-edit").click();
    await expect(mine.getByRole("img", { name: "Çözüm fotoğrafı" })).toBeVisible();
    await expect(mine.getByRole("button", { name: "Fotoğrafı kaldır" })).toBeVisible();
    await expect(mine.getByText("Fotoğrafı değiştir")).toBeVisible();
  });
});

test.describe("görsel düzenleme davranışı", () => {
  test("yeni yüklenen fotoğraf Kaldır ile mevcutla birlikte kalkar; Vazgeç yüklenen dosyayı siler", async ({ page }) => {
    const { question, world: w } = await freshQuestion(`Kaldır davranışı ${Date.now().toString(36)}`, 3);
    const student = await studentLogin(page);
    const imageId = await uploadQuestionImage(student, "solutionImage");
    await answerQuestion(student, question.id, 3, validExplanation(w.settings.aciklamaMinKarakter), imageId);
    await page.goto(`/sorular/${question.id}`);
    const mine = page.getByTestId("solution").filter({ hasText: "(Sen)" });

    await mine.getByTestId("solution-edit").click();
    const uploaded = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/files" && response.request().method() === "POST");
    await page.getByTestId("photo-input").setInputFiles(pngFile("yeni.png", 640, 480));
    const newId = ((await (await uploaded).json()) as { id: number }).id;
    await expect(page.getByTestId("upload-status")).toHaveAttribute("data-status", "done", { timeout: 30_000 });
    await page.getByRole("button", { name: "Fotoğrafı kaldır" }).click();
    await expect(page.getByTestId("photo-attachment").getByRole("img")).toHaveCount(0);
    await expect(page.getByText("Fotoğraf ekle")).toBeVisible();
    await expect.poll(async () => (await page.request.get(`/api/files/${newId}`)).status()).toBe(404);

    await page.getByRole("button", { name: "Vazgeç" }).click();
    await expect(mine.locator("img[alt='Çözüm görseli']")).toBeVisible();

    await mine.getByTestId("solution-edit").click();
    const second = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/files" && response.request().method() === "POST");
    await page.getByTestId("photo-input").setInputFiles(pngFile("ikinci.png", 640, 480));
    const secondId = ((await (await second).json()) as { id: number }).id;
    await expect(page.getByTestId("upload-status")).toHaveAttribute("data-status", "done", { timeout: 30_000 });
    await page.getByRole("button", { name: "Vazgeç" }).click();
    await expect.poll(async () => (await page.request.get(`/api/files/${secondId}`)).status()).toBe(404);
    await expect(mine.locator("img[alt='Çözüm görseli']")).toBeVisible();
  });
});

test.describe("erişilebilirlik", () => {
  test("soru yükle (boş ve kartlı) ile sorularım axe temiz", async ({ page }) => {
    const w = await world();
    const student = await studentLogin(page);
    await page.goto("/soru-yukle");
    await expect(page.getByRole("heading", { name: "Soru Yükle", level: 1 })).toBeVisible();
    await expect(page.getByTestId("quota-remaining")).toBeVisible();
    await axeClean(page, "soru-yukle boş");
    await page.getByTestId("photo-input").setInputFiles([pngFile("a.png"), pngFile("b.png")]);
    await waitUploaded(page, 2);
    await fill(page.getByTestId("upload-card").first(), w.lessons[0]!.name, "A", validExplanation(w.settings.aciklamaMinKarakter));
    await page.getByTestId("submit-questions").click();
    await expect(page.getByTestId("upload-notice")).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => page.evaluate(() => (document.querySelector("[data-sonner-toast]") ? getComputedStyle(document.querySelector("[data-sonner-toast]")!).opacity : "1")))
      .toBe("1");
    await axeClean(page, "soru-yukle kartlı");
    await page.goto("/sorularim");
    await expect(page.getByRole("heading", { name: "Sorularım", level: 1 })).toBeVisible();
    await expect(page.getByTestId("my-question")).toHaveCount(1);
    await axeClean(page, "sorularim");
    void student;
  });

  test("görselli cevap formu axe temiz", async ({ page }) => {
    const { question } = await freshQuestion(`Axe görsel ${Date.now().toString(36)}`, 2);
    await studentLogin(page);
    await page.goto(`/sorular/${question.id}`);
    await page.getByTestId("photo-input").setInputFiles(pngFile("cozum.png"));
    await expect(page.getByTestId("upload-status")).toHaveAttribute("data-status", "done", { timeout: 30_000 });
    await axeClean(page, "cevap formu görselli");
  });
});
