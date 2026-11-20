import type { Browser, Page } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { adminToken, backend, createAccount, randomIp, uniqueName } from "./support/backend";
import { expect, login, test } from "./support/fixtures";
import { activeUser, branchTeacher, type ActiveUser } from "./support/student-data";
import { reportQuestion, studentQuestion } from "./support/teacher-data";
import { validExplanation, world } from "./support/world";

test.describe.configure({ mode: "serial" });

const NEW_PASSWORD = "Yeni-Sifre-2026-Zz";

interface ApiUser {
  id: number;
  userName: string;
  firstName: string;
  lastName: string;
  className: string | null;
  role: string;
  isBanned: boolean;
  bannedAt: string | null;
  isSystemAccount: boolean;
  pendingReportCount: number;
}

async function mudurSession(page: Page): Promise<ActiveUser> {
  const mudur = await activeUser("mudur");
  await login(page, mudur.userName, mudur.password);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
  return mudur;
}

async function listUsers(): Promise<ApiUser[]> {
  const token = await adminToken();
  const result = await backend<ApiUser[]>("GET", "/api/admin/users", { token });
  expect(result.status).toBe(200);
  return result.body;
}

async function findUser(userName: string): Promise<ApiUser | undefined> {
  return (await listUsers()).find((user) => user.userName === userName);
}

async function getUser(id: number): Promise<ApiUser> {
  const token = await adminToken();
  const result = await backend<ApiUser>("GET", `/api/admin/users/${id}`, { token });
  expect(result.status).toBe(200);
  return result.body;
}

function visibleRows(page: Page) {
  return page.getByTestId("bulk-row").locator("visible=true");
}

async function noOverflow(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => window.matchMedia("(min-width: 1024px)").matches === window.innerWidth >= 1024, undefined, { timeout: 5000 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `taşma ${label}`, timeout: 5000 })
    .toBeLessThanOrEqual(0);
}

function sizesFor(projectName: string): (number | null)[] {
  return projectName === "webkit-iphone" ? [null] : [375, 768, 1280];
}

async function otherPage(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
  return { context, page: await context.newPage() };
}

async function reportSetup(label: string) {
  const w = await world();
  const lesson = w.lessons[0]!;
  const author = await activeUser("ogrenci", "yazar");
  const reporter = await activeUser("ogrenci", "ihbar");
  const questionId = await studentQuestion(author, lesson.id, validExplanation(w.settings.aciklamaMinKarakter));
  const description = `${label} şikâyeti ${Date.now().toString(36)}`;
  await reportQuestion(reporter, questionId, "incomplete", description);
  const token = await adminToken();
  const reports = await backend<{ items: { id: number; description: string }[] }>(
    "GET",
    `/api/admin/reports?status=pending&questionId=${questionId}&pageSize=50`,
    { token },
  );
  const report = reports.body.items.find((item) => item.description === description);
  if (!report) throw new Error("Şikâyet bulunamadı.");
  return { lesson, author, reporter, questionId, reportId: report.id, description };
}

test.describe("toplu kullanıcı ekleme", () => {
  test("üç satır yapıştırılır, şifre tablosu çıkar, ilk giriş ve zorunlu şifre değişimi çalışır", async ({ page, browser, baseURL }, testInfo) => {
    const w = await world();
    const lessonName = w.lessons[0]!.name;
    await mudurSession(page);
    const first = uniqueName("topluA");
    const second = uniqueName("topluB");
    const third = uniqueName("topluC");

    await page.goto("/yonetim/kullanicilar");
    await page.getByRole("link", { name: "Toplu Ekle" }).click();
    await expect(page).toHaveURL(/\/yonetim\/kullanicilar\/toplu$/);
    await page.getByTestId("bulk-text").fill(
      `ad;soyad;kullanıcıAdı;sınıf;rol;branş\nAli;Yılmaz;${first};8-A;ogrenci\nAyşe;Demir;${second};;Öğretmen;${lessonName}\nVeli;Kaya;${third};7-B;ÖĞRENCİ`,
    );
    await expect(visibleRows(page)).toHaveCount(3);
    await expect(page.getByTestId("bulk-error-summary")).toHaveCount(0);
    await page.getByTestId("bulk-submit").click();

    await expect(page.getByTestId("bulk-result")).toBeVisible();
    await expect(page.getByTestId("bulk-result-row")).toHaveCount(3);
    await expect(page.getByTestId("bulk-warning")).toContainText("bir daha gösterilmeyecek");
    await expect(page.getByTestId("bulk-text")).toHaveCount(0);

    const credentials: Record<string, string> = {};
    const entries = page.getByTestId("bulk-result-row");
    for (let index = 0; index < 3; index += 1) {
      const row = entries.nth(index);
      const userName = ((await row.getByTestId("bulk-result-username").textContent()) ?? "").trim();
      credentials[userName] = ((await row.getByTestId("bulk-result-password").textContent()) ?? "").trim();
      expect(credentials[userName]!.length).toBeGreaterThanOrEqual(8);
    }
    expect(Object.keys(credentials).sort()).toEqual([first, second, third].sort());

    const created = await listUsers();
    expect(created.find((user) => user.userName === first)?.role).toBe("ogrenci");
    expect(created.find((user) => user.userName === first)?.className).toBe("8-A");
    expect(created.find((user) => user.userName === second)?.role).toBe("ogretmen");
    expect(created.find((user) => user.userName === third)?.role).toBe("ogrenci");

    const storage = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]));
    for (const password of Object.values(credentials)) expect(storage).not.toContain(password);

    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("bulk-warning")).toBeHidden();
    await expect(page.getByTestId("bulk-result")).toBeVisible();
    await page.emulateMedia({ media: "screen" });

    if (testInfo.project.name === "chromium") {
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.getByTestId("bulk-copy").click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied.split("\n")).toHaveLength(4);
      expect(copied).toContain(credentials[first]!);
      expect(copied.split("\n")[0]?.trimEnd()).toBe("Ad Soyad\tKullanıcı Adı\tSınıf\tRol\tŞifre");
    }

    let dialogMessage = "";
    page.once("dialog", (dialog) => {
      dialogMessage = dialog.message();
      void dialog.dismiss();
    });
    await page.getByRole("link", { name: "Listeye Dön" }).click();
    await expect.poll(() => dialogMessage).toContain("bir daha gösterilmeyecek");
    await expect(page).toHaveURL(/\/yonetim\/kullanicilar\/toplu$/);
    await expect(page.getByTestId("bulk-result")).toBeVisible();

    const other = await otherPage(browser, baseURL);
    try {
      await login(other.page, first, credentials[first]!);
      await expect(other.page).toHaveURL(/\/sifre-degistir/);
      await other.page.getByLabel(/^Mevcut Şifre/).fill(credentials[first]!);
      await other.page.getByLabel(/^Yeni Şifre\*?$/).fill(NEW_PASSWORD);
      await other.page.getByLabel(/^Yeni Şifre \(Tekrar\)/).fill(NEW_PASSWORD);
      await other.page.getByRole("button", { name: "Şifreyi Kaydet" }).click();
      await expect(other.page.getByRole("heading", { name: /Merhaba Ali/ })).toBeVisible();
    } finally {
      await other.context.close();
    }
  });

  test("yinelenen kullanıcı adı satır hatası verir ve hiç kullanıcı oluşmaz", async ({ page }) => {
    await mudurSession(page);
    const existing = await createAccount("ogrenci", "mevcut");
    const fresh = uniqueName("yeniA");
    const freshTwo = uniqueName("yeniB");
    await page.goto("/yonetim/kullanicilar/toplu");

    await page.getByTestId("bulk-text").fill(`Ali;Yılmaz;${fresh};8-A;ogrenci\nVeli;Kaya;${fresh.toUpperCase()};8-A;ogrenci`);
    await expect(page.getByTestId("bulk-error-summary")).toContainText("1 satırda hata var");
    await expect(page.getByTestId("bulk-error-summary")).toContainText("1. satırda");
    await expect(page.getByTestId("bulk-submit")).toBeDisabled();
    expect(await findUser(fresh)).toBeUndefined();

    await page.getByTestId("bulk-text").fill(`Ali;Yılmaz;${fresh};8-A;ogrenci\nVeli;Kaya;${existing.userName};8-A;ogrenci\nAyşe;Öz;${freshTwo};8-B;ogrenci`);
    await expect(page.getByTestId("bulk-submit")).toBeEnabled();
    await page.getByTestId("bulk-submit").click();

    await expect(page.getByTestId("bulk-error-summary")).toContainText("Satır 2");
    await expect(visibleRows(page).and(page.locator('[data-invalid="true"]'))).toHaveCount(1);
    await expect(page.getByTestId("bulk-result")).toHaveCount(0);
    await expect(page.getByTestId("bulk-submit")).toBeDisabled();

    const users = await listUsers();
    expect(users.find((user) => user.userName === fresh)).toBeUndefined();
    expect(users.find((user) => user.userName === freshTwo)).toBeUndefined();

    await page.getByTestId("bulk-text").fill(`Ali;Yılmaz;${fresh};8-A;ogrenci`);
    await expect(page.getByTestId("bulk-error-summary")).toHaveCount(0);
    await expect(page.getByTestId("bulk-submit")).toBeEnabled();
  });

  test("429 yanıtında geri sayım gösterilir ve süre dolunca yeniden denenebilir", async ({ page }) => {
    await mudurSession(page);
    await page.route("**/api/admin/users/bulk", async (route) => {
      await route.fulfill({
        status: 429,
        headers: { "content-type": "application/problem+json", "retry-after": "3" },
        body: JSON.stringify({ title: "Çok fazla istek", status: 429 }),
      });
    });
    await page.goto("/yonetim/kullanicilar/toplu");
    await page.getByTestId("bulk-text").fill(`Ali;Yılmaz;${uniqueName("sinir")};8-A;ogrenci`);
    await page.getByTestId("bulk-submit").click();
    await expect(page.getByTestId("problem-banner")).toContainText("saniye sonra tekrar deneyebilirsiniz");
    await expect(page.getByTestId("bulk-submit")).toBeDisabled();
    await expect(page.getByTestId("bulk-submit")).toBeEnabled({ timeout: 10_000 });
  });

  test("375, 768 ve 1280 genişlikte taşma yok ve erişilebilirlik ihlali yok (önizleme, hata ve sonuç)", async ({ page }, testInfo) => {
    await mudurSession(page);
    const sizes = sizesFor(testInfo.project.name);
    const good = uniqueName("duzenA");
    const better = uniqueName("duzenB");
    await page.goto("/yonetim/kullanicilar/toplu");
    await page.getByTestId("bulk-text").fill(`Ali;Yılmaz;${good};8-A;ogrenci\nAyşe;Demir;${better};;ogretmen`);
    await expect(visibleRows(page)).toHaveCount(2);
    for (const size of sizes) {
      if (size !== null) await page.setViewportSize({ width: size, height: 900 });
      await noOverflow(page, `önizleme ${size ?? "iphone"}`);
      await expectNoAxeViolations(page, `toplu-onizleme ${size ?? "iphone"}`);
    }

    await page.getByTestId("bulk-text").fill(`Ali;Yılmaz;${good};8-A;ogrenci\nAli;Çok;${good};${"x".repeat(60)};veli\n;;ab;;`);
    await expect(page.getByTestId("bulk-error-summary")).toBeVisible();
    for (const size of sizes) {
      if (size !== null) await page.setViewportSize({ width: size, height: 900 });
      await noOverflow(page, `hata ${size ?? "iphone"}`);
      await expectNoAxeViolations(page, `toplu-hata ${size ?? "iphone"}`);
    }

    await page.getByTestId("bulk-text").fill(`Ali;Yılmaz;${good};8-A;ogrenci\nAyşe;Demir;${better};;ogretmen`);
    await page.getByTestId("bulk-submit").click();
    await expect(page.getByTestId("bulk-result")).toBeVisible();
    for (const size of sizes) {
      if (size !== null) await page.setViewportSize({ width: size, height: 900 });
      await noOverflow(page, `sonuç ${size ?? "iphone"}`);
      await expectNoAxeViolations(page, `toplu-sonuc ${size ?? "iphone"}`);
    }
  });
});

test.describe("profil düzenleme", () => {
  test("öğrenci düzenlenir, HTML düz metin kalır; öğretmende sınıf alanı yok; sistem hesabında düğme yok", async ({ page }) => {
    await mudurSession(page);
    const student = await createAccount("ogrenci", "duzen", { firstName: "Ali", lastName: "Veli" });
    const teacher = await createAccount("ogretmen", "hocaduzen", { firstName: "Ayşe", lastName: "Demir" });

    await page.goto(`/yonetim/kullanicilar/${student.id}`);
    await page.getByTestId("action-edit").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/^Sınıf/)).toBeVisible();
    await dialog.getByLabel(/^Ad\*?$/).fill("");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog.getByText("Ad zorunlu.")).toBeVisible();

    await dialog.getByLabel(/^Ad\*?$/).fill("<b>Ali</b>");
    await dialog.getByLabel(/^Soyad\*?$/).fill("Kaya");
    await dialog.getByLabel(/^Sınıf/).fill("9-C");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("user-name")).toHaveText("<b>Ali</b> Kaya");
    await expect(page.getByTestId("user-name").locator("b")).toHaveCount(0);
    const saved = await getUser(student.id);
    expect(saved.firstName).toBe("<b>Ali</b>");
    expect(saved.className).toBe("9-C");

    await page.getByTestId("action-edit").click();
    await page.getByRole("dialog").getByLabel(/^Sınıf/).fill("x".repeat(51));
    await page.getByRole("dialog").getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByRole("dialog").getByText(/en fazla 50/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Vazgeç" }).click();

    await page.goto(`/yonetim/kullanicilar/${teacher.id}`);
    await page.getByTestId("action-edit").click();
    await expect(page.getByRole("dialog").getByLabel(/^Ad\*?$/)).toBeVisible();
    await expect(page.getByRole("dialog").getByLabel(/^Sınıf/)).toHaveCount(0);
    await page.getByRole("dialog").getByLabel(/^Soyad\*?$/).fill("Yıldız");
    await page.getByRole("dialog").getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByTestId("user-name")).toHaveText("Ayşe Yıldız");
    expect((await getUser(teacher.id)).className).toBeNull();

    const system = (await listUsers()).find((user) => user.isSystemAccount);
    if (system) {
      await page.goto(`/yonetim/kullanicilar/${system.id}`);
      await expect(page.getByTestId("user-name")).toBeVisible();
      await expect(page.getByTestId("action-edit")).toHaveCount(0);
    }
  });

  test("başka biri değiştirmişse 409 mesajı gösterilir", async ({ page }) => {
    await mudurSession(page);
    const student = await createAccount("ogrenci", "yaris", { firstName: "Mert", lastName: "Aksoy" });
    await page.goto(`/yonetim/kullanicilar/${student.id}`);
    await page.getByTestId("action-edit").click();
    await page.route(`**/api/admin/users/${student.id}`, async (route) => {
      if (route.request().method() !== "PUT") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 409,
        headers: { "content-type": "application/problem+json" },
        body: JSON.stringify({ title: "Çakışma", status: 409, detail: "Kullanıcı başka biri tarafından değiştirilmiş. Yeniden deneyin." }),
      });
    });
    await page.getByRole("dialog").getByLabel(/^Soyad\*?$/).fill("Yeni");
    await page.getByRole("dialog").getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByRole("dialog").getByTestId("problem-banner")).toContainText("başka biri tarafından değiştirilmiş");
    await expect(page.getByRole("dialog").getByLabel(/^Soyad\*?$/)).toHaveValue("Yeni");
  });
});

test.describe("şikâyet ve engelleme", () => {
  test("müdür kullanıcıyı engelleyerek çözer; liste rozeti, filtre ve engellenme bilgisi doğru", async ({ page }) => {
    test.setTimeout(120_000);
    const setup = await reportSetup("Engelleme");
    const mudur = await mudurSession(page);
    const search = page.getByLabel("Kullanıcı Ara");

    await page.goto("/yonetim/kullanicilar");
    await search.fill(setup.author.userName);
    await expect(page.getByText("Şikâyet var (1)").locator("visible=true")).toHaveCount(1);
    await expectNoAxeViolations(page, "kullanici-listesi-sikayet");

    await page.getByTestId("reported-filter").click();
    await expect(page).toHaveURL(/sikayetli=1/);
    await expect(page.getByText("Şikâyet var (1)").locator("visible=true")).toHaveCount(1);
    await search.fill(setup.reporter.userName);
    await expect(page.getByText("Eşleşen Kullanıcı Yok")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("reported-filter")).toHaveAttribute("aria-pressed", "true");

    await page.goto(`/yonetim/kullanicilar/${setup.author.id}`);
    await expect(page.getByTestId("report-info")).toContainText("1");
    await page.getByRole("link", { name: "Şikâyetlere Git" }).click();
    await expect(page).toHaveURL(/\/ogretmen\/sikayetler$/);

    await page.goto(`/ogretmen/sikayetler/${setup.reportId}`);
    await expect(page.getByTestId("reported-user-link")).toHaveAttribute("href", `/yonetim/kullanicilar/${setup.author.id}`);
    await page.getByRole("radio", { name: /Kullanıcıyı Engelle/ }).check();
    await page.getByTestId("resolve-submit").click();
    await page.getByRole("dialog").getByRole("button", { name: "Uygula" }).click();
    await expect(page.getByTestId("report-outcome")).toBeVisible();

    const banned = await getUser(setup.author.id);
    expect(banned.isBanned).toBe(true);
    expect(banned.bannedAt).not.toBeNull();

    await page.getByTestId("reported-user-link").click();
    await expect(page.getByTestId("ban-info")).toContainText("Engellenme:");
    await expect(page.getByTestId("ban-info")).toContainText(mudur.userName);
    await expect(page.getByTestId("report-info")).toHaveCount(0);

    await page.goto("/yonetim/kullanicilar");
    await search.fill(setup.author.userName);
    await expect(page.getByText("Banlı").locator("visible=true")).toHaveCount(1);
    await expect(page.getByTestId("ban-date").locator("visible=true")).toContainText("Engellendi:");
    await expect(page.getByText(/Şikâyet Var \(/)).toHaveCount(0);
    await page.getByTestId("reported-filter").click();
    await expect(page.getByText("Eşleşen Kullanıcı Yok")).toBeVisible();
  });

  test("öğretmen şikâyet detayında kullanıcıyı engelle seçeneğini görmez", async ({ page }) => {
    const setup = await reportSetup("Öğretmen");
    const teacher = await branchTeacher(setup.lesson.id);
    await login(page, teacher.userName, teacher.password);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await page.goto(`/ogretmen/sikayetler/${setup.reportId}`);
    await expect(page.getByRole("radio", { name: /Şikâyeti Reddet/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Kullanıcıyı Engelle/ })).toHaveCount(0);
    await expect(page.getByTestId("reported-user-link")).toHaveCount(0);
  });
});
