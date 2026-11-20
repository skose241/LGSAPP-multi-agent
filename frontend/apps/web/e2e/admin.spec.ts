import type { Browser, Page } from "@playwright/test";
import {
  activateAccount,
  banAccount,
  createAccount,
  randomIp,
  requestPasswordReset,
  VALID_PASSWORD,
  type CreatedAccount,
} from "./support/backend";
import { attemptLogin, expect, login, test } from "./support/fixtures";

const NEW_PASSWORD = "Yeni-Sifre-2026-Zz";

async function mudurSession(page: Page): Promise<CreatedAccount> {
  const account = await createAccount("mudur");
  await activateAccount(account);
  await login(page, account.userName, VALID_PASSWORD);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
  return account;
}

async function otherPage(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
  return { context, page: await context.newPage() };
}

async function readOneTimeCredentials(page: Page) {
  const password = await page.getByTestId("one-time-password").inputValue();
  const userName = (await page.getByTestId("otp-username").textContent()) ?? "";
  return { userName, password };
}

async function fillCreateForm(page: Page, values: { userName: string; firstName: string; lastName: string; className?: string }) {
  await page.getByLabel(/^Kullanıcı Adı\*?$/).fill(values.userName);
  await page.getByLabel(/^Ad\*?$/).fill(values.firstName);
  await page.getByLabel(/^Soyad\*?$/).fill(values.lastName);
  if (values.className) await page.getByLabel(/^Sınıf/).fill(values.className);
}

function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

function usesCards(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 1280;
}

test.describe("kullanıcı oluşturma", () => {
  test("branşlı öğretmen oluşturulur, tek seferlik şifreyle giriş ve zorunlu değişim", async ({ page, browser, baseURL }) => {
    await mudurSession(page);
    await page.goto("/yonetim/kullanicilar/yeni");
    await page.getByLabel(/^Rol\*?$/).selectOption("ogretmen");
    const userName = `ogretmen.${Date.now().toString(36)}`;
    await fillCreateForm(page, { userName, firstName: "Ayşe", lastName: "Öğretmen" });
    const branch = page.getByLabel(/^Branş Dersi/);
    await expect(branch.locator("option")).not.toHaveCount(1);
    const branchName = (await branch.locator("option").nth(1).textContent()) ?? "";
    await branch.selectOption({ index: 1 });
    await page.getByRole("button", { name: "Hesap Oluştur" }).click();

    await expect(page.getByRole("heading", { name: "Hesap Oluşturuldu" })).toBeVisible();
    const credentials = await readOneTimeCredentials(page);
    expect(credentials.userName).toBe(userName);
    expect(credentials.password.length).toBeGreaterThanOrEqual(8);
    await expect(page.getByText("Bu şifre bir daha gösterilmeyecek.")).toBeVisible();

    const storage = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]));
    expect(storage).not.toContain(credentials.password);

    await page.goto("/yonetim/kullanicilar");
    await expect(page.getByText(credentials.password)).toHaveCount(0);

    const other = await otherPage(browser, baseURL);
    try {
      await login(other.page, credentials.userName, credentials.password);
      await expect(other.page).toHaveURL(/\/sifre-degistir/);
      await other.page.getByLabel(/^Mevcut Şifre/).fill(credentials.password);
      await other.page.getByLabel(/^Yeni Şifre\*?$/).fill(NEW_PASSWORD);
      await other.page.getByLabel(/^Yeni Şifre \(Tekrar\)/).fill(NEW_PASSWORD);
      await other.page.getByRole("button", { name: "Şifreyi Kaydet" }).click();
      await expect(other.page.getByRole("heading", { name: /Merhaba Ayşe/ })).toBeVisible();
    } finally {
      await other.context.close();
    }

    await page.goto("/yonetim/kullanicilar");
    await page.getByLabel("Kullanıcı Ara").fill(userName);
    await page.getByRole("link", { name: "Ayşe Öğretmen" }).locator("visible=true").first().click();
    await expect(page.getByTestId("user-username")).toHaveText(userName);
    await expect(page.getByText(branchName.trim()).first()).toBeVisible();
  });

  test("öğrenci oluşturulur ve sınıfı kaydedilir", async ({ page }) => {
    await mudurSession(page);
    await page.goto("/yonetim/kullanicilar/yeni");
    const userName = `ogrenci.${Date.now().toString(36)}`;
    await fillCreateForm(page, { userName, firstName: "Mert", lastName: "Kaya", className: "8-C" });
    await page.getByRole("button", { name: "Hesap Oluştur" }).click();
    await expect(page.getByRole("heading", { name: "Hesap Oluşturuldu" })).toBeVisible();
    await page.getByRole("link", { name: "Listeye Dön" }).click();
    await page.getByLabel("Kullanıcı Ara").fill("8-c");
    await expect(page.getByText(userName).locator("visible=true").first()).toBeVisible();
  });

  test("yinelenen kullanıcı adında alan hatası gösterilir", async ({ page }) => {
    await mudurSession(page);
    const existing = await createAccount("ogrenci");
    await page.goto("/yonetim/kullanicilar/yeni");
    await fillCreateForm(page, { userName: existing.userName, firstName: "Aynı", lastName: "Ad" });
    await page.getByRole("button", { name: "Hesap Oluştur" }).click();
    await expect(page.getByText("Bu kullanıcı adı zaten kayıtlı.").first()).toBeVisible();
    await expect(page.getByLabel(/^Kullanıcı Adı\*?$/)).toHaveAttribute("aria-invalid", "true");
  });

  test("rezerve ad alan hatası verir", async ({ page }) => {
    await mudurSession(page);
    await page.goto("/yonetim/kullanicilar/yeni");
    await fillCreateForm(page, { userName: "sistem", firstName: "Rezerve", lastName: "Ad" });
    await page.getByRole("button", { name: "Hesap Oluştur" }).click();
    await expect(page.getByLabel(/^Kullanıcı Adı\*?$/)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/ayrılmıştır/).first()).toBeVisible();
  });

  test("yeni müdür oluşturma onay ister ve ağır işlem olarak ayrıdır", async ({ page }) => {
    await mudurSession(page);
    await page.goto("/yonetim/kullanicilar");
    await page.getByRole("link", { name: "Yeni Müdür" }).click();
    await expect(page.getByText("Yeni Müdür Hesabı")).toBeVisible();
    const userName = `mudur.${Date.now().toString(36)}`;
    await fillCreateForm(page, { userName, firstName: "Yeni", lastName: "Müdür" });
    await page.getByRole("button", { name: "Müdür Hesabı Oluştur" }).click();
    await expect(page.getByText("Devam etmek için onay vermelisiniz.")).toBeVisible();
    await page.getByLabel("Müdür hesabı oluşturmak istediğimi onaylıyorum").check();
    await page.getByRole("button", { name: "Müdür Hesabı Oluştur" }).click();
    await expect(page.getByRole("heading", { name: "Hesap Oluşturuldu" })).toBeVisible();
    await expect(page.getByTestId("otp-username")).toHaveText(userName);
  });
});

test.describe("kullanıcı işlemleri", () => {
  test("ban oturumu düşürür, unban tekrar girişe izin verir", async ({ page, browser, baseURL }) => {
    await mudurSession(page);
    const account = await createAccount("ogrenci");
    await activateAccount(account);

    const other = await otherPage(browser, baseURL);
    try {
      await login(other.page, account.userName, VALID_PASSWORD);
      await expect(other.page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();

      await page.goto(`/yonetim/kullanicilar/${account.id}`);
      await page.getByTestId("action-ban").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("Hesap engellensin mi?");
      await dialog.getByRole("button", { name: "Evet, Engelle" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByText("Banlı").first()).toBeVisible();
      await expect(page.getByTestId("action-unban")).toBeVisible();

      await other.page.goto("/profil");
      await other.page.waitForURL(/\/giris\?neden=oturum/);
      await attemptLogin(other.page, account.userName, VALID_PASSWORD);
      await expect(other.page.getByTestId("problem-banner")).toContainText("Hesap engellenmiş.");

      await page.getByTestId("action-unban").click();
      await page.getByRole("dialog").getByRole("button", { name: "Evet, Kaldır" }).click();
      await expect(page.getByTestId("action-ban")).toBeVisible();

      await login(other.page, account.userName, VALID_PASSWORD);
      await expect(other.page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    } finally {
      await other.context.close();
    }
  });

  test("şifre yenileyince eski şifre çalışmaz, yeni tek seferlik şifre çalışır", async ({ page, browser, baseURL }) => {
    await mudurSession(page);
    const account = await createAccount("ogrenci");
    await activateAccount(account);

    await page.goto(`/yonetim/kullanicilar/${account.id}`);
    await page.getByTestId("action-regenerate").click();
    await page.getByRole("dialog").getByRole("button", { name: "Evet, Yenile" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Yeni Tek Seferlik Şifre");
    const credentials = await readOneTimeCredentials(page);
    expect(credentials.userName).toBe(account.userName);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Şifreyi Not Aldım" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(credentials.password)).toHaveCount(0);

    const other = await otherPage(browser, baseURL);
    try {
      await attemptLogin(other.page, account.userName, VALID_PASSWORD);
      await expect(other.page.getByTestId("problem-banner")).toContainText("Kullanıcı adı veya şifre hatalı.");
      await login(other.page, account.userName, credentials.password);
      await expect(other.page).toHaveURL(/\/sifre-degistir/);
    } finally {
      await other.context.close();
    }
  });

  test("branş dersi değiştirilir", async ({ page }) => {
    await mudurSession(page);
    const account = await createAccount("ogretmen");
    await activateAccount(account);
    await page.goto(`/yonetim/kullanicilar/${account.id}`);
    await expect(page.getByText("Atanmamış", { exact: true })).toBeVisible();

    await page.getByTestId("action-branch").click();
    const dialog = page.getByRole("dialog");
    const select = dialog.getByLabel(/^Branş Dersi/);
    const name = ((await select.locator("option").nth(1).textContent()) ?? "").trim();
    await select.selectOption({ index: 1 });
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(`Şu an: ${name}`)).toBeVisible();

    await page.getByTestId("action-branch").click();
    await page.getByRole("dialog").getByLabel(/^Branş Dersi/).selectOption("");
    await page.getByRole("dialog").getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Şu an branş atanmamış.")).toBeVisible();
  });

  test("öğrencide branş işlemi görünmez", async ({ page }) => {
    await mudurSession(page);
    const account = await createAccount("ogrenci");
    await page.goto(`/yonetim/kullanicilar/${account.id}`);
    await expect(page.getByTestId("action-ban")).toBeEnabled();
    await expect(page.getByTestId("action-branch")).toHaveCount(0);
  });

  test("müdür hesabında yasak işlemler devre dışıdır ve nedeni görünür", async ({ page }) => {
    const self = await mudurSession(page);
    const other = await createAccount("mudur");
    await activateAccount(other);

    await page.goto(`/yonetim/kullanicilar/${other.id}`);
    await expect(page.getByTestId("action-ban")).toBeDisabled();
    await expect(page.getByTestId("action-ban-reason")).toContainText("Müdür hesapları banlanamaz.");
    await expect(page.getByTestId("action-regenerate")).toBeDisabled();
    await expect(page.getByTestId("action-regenerate-reason")).toContainText("Müdür hesaplarının şifresi bu yolla yenilenemez.");

    await page.goto(`/yonetim/kullanicilar/${self.id}`);
    await expect(page.getByTestId("action-ban")).toBeDisabled();
    await expect(page.getByTestId("action-ban-reason")).toContainText("Kendi hesabınızı engelleyemezsiniz.");
    await expect(page.getByTestId("action-regenerate")).toBeDisabled();
  });

  test("olmayan kullanıcı için bulunamadı gösterilir", async ({ page }) => {
    await mudurSession(page);
    await page.goto("/yonetim/kullanicilar/99999999");
    await expect(page.getByRole("heading", { name: "Kullanıcı Bulunamadı" })).toBeVisible();
  });
});

test.describe("şifre talepleri", () => {
  test("talep onaylanınca yeni şifreyle giriş yapılır, rozet ve pano sayısı gerçek veriyi gösterir", async ({ page, browser, baseURL }) => {
    await mudurSession(page);
    const account = await createAccount("ogrenci", "ogrenci", { firstName: "Talep", lastName: "Sahibi" });
    await activateAccount(account);
    await requestPasswordReset(account.userName);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Şifre Talepleri" })).toBeVisible();
    await expect(page.getByText("Bekleyen Talep", { exact: true })).toBeVisible();

    if (!isMobile(page)) {
      await expect(page.getByRole("link", { name: /Şifre Talepleri/ }).first()).toContainText(/\d+ yeni/);
    }

    await page.goto("/yonetim/sifre-talepleri");
    await expect(page.getByText(account.userName)).toBeVisible();
    await page.getByRole("button", { name: `${account.userName} talebini onayla` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Onayla ve Şifre Üret" }).click();
    await expect(page.getByRole("dialog")).toContainText("Yeni Tek Seferlik Şifre");
    const credentials = await readOneTimeCredentials(page);
    await page.getByRole("button", { name: "Şifreyi Not Aldım" }).click();
    await expect(page.getByText(account.userName)).toHaveCount(0);

    const other = await otherPage(browser, baseURL);
    try {
      await attemptLogin(other.page, account.userName, VALID_PASSWORD);
      await expect(other.page.getByTestId("problem-banner")).toBeVisible();
      await login(other.page, account.userName, credentials.password);
      await expect(other.page).toHaveURL(/\/sifre-degistir/);
    } finally {
      await other.context.close();
    }
  });

  test("talep reddedilir ve listeden düşer", async ({ page }) => {
    await mudurSession(page);
    const account = await createAccount("ogrenci");
    await activateAccount(account);
    await requestPasswordReset(account.userName);

    await page.goto("/yonetim/sifre-talepleri");
    await expect(page.getByText(account.userName)).toBeVisible();
    await page.getByRole("button", { name: `${account.userName} talebini reddet` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reddet" }).click();
    await expect(page.getByText(account.userName)).toHaveCount(0);
  });

  test("Esc ile onay dialogu kapanır", async ({ page }) => {
    await mudurSession(page);
    const account = await createAccount("ogrenci");
    await activateAccount(account);
    await requestPasswordReset(account.userName);
    await page.goto("/yonetim/sifre-talepleri");
    await page.getByRole("button", { name: `${account.userName} talebini onayla` }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(account.userName)).toBeVisible();
  });
});

test.describe("erişim ve güvenlik", () => {
  test("öğretmen ve öğrenci yönetim adreslerine gidemez", async ({ page }) => {
    const teacher = await createAccount("ogretmen");
    await activateAccount(teacher);
    await login(page, teacher.userName, VALID_PASSWORD);
    for (const path of ["/yonetim/kullanicilar", "/yonetim/kullanicilar/yeni", "/yonetim/kullanicilar/1", "/yonetim/sifre-talepleri"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
    }
  });

  test("ad, soyad ve sınıfta HTML düz metin olarak görünür", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await mudurSession(page);
    const payloadFirst = "<img src=x onerror=window.__xss=1>";
    const payloadLast = '"><script>window.__xss=2</script>';
    const account = await createAccount("ogrenci", "xss", { firstName: payloadFirst, lastName: payloadLast, className: "<b>8-X</b>" });
    await activateAccount(account);
    await requestPasswordReset(account.userName);

    await page.goto("/yonetim/kullanicilar");
    await page.getByLabel("Kullanıcı Ara").fill(account.userName);
    await expect(page.getByText(payloadFirst).locator("visible=true").first()).toBeVisible();
    await expect(page.locator("img[src='x']")).toHaveCount(0);
    await expect(page.getByText("<b>8-X</b>").locator("visible=true").first()).toBeVisible();

    await page.goto(`/yonetim/kullanicilar/${account.id}`);
    await expect(page.getByTestId("user-name")).toContainText(payloadFirst);
    await expect(page.locator("img[src='x']")).toHaveCount(0);

    await page.goto("/yonetim/sifre-talepleri");
    await expect(page.getByTestId("request-name").filter({ hasText: payloadFirst }).first()).toBeVisible();
    await expect(page.locator("img[src='x']")).toHaveCount(0);

    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });
});

test.describe("liste görünümü", () => {
  test("masaüstünde tablo, mobilde kart görünür; rol sekmeleri ve arama çalışır", async ({ page }) => {
    await mudurSession(page);
    const student = await createAccount("ogrenci", "liste", { firstName: "Işık", lastName: "Çalışkan" });
    await createAccount("ogretmen", "liste");
    await banAccount(student.id);

    await page.goto("/yonetim/kullanicilar");
    if (usesCards(page)) {
      await expect(page.getByRole("list", { name: "Kullanıcı kartları" })).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
    } else {
      await expect(page.getByRole("table", { name: "Kullanıcı Listesi" })).toBeVisible();
      await expect(page.getByRole("list", { name: "Kullanıcı kartları" })).toHaveCount(0);
    }

    await page.getByLabel("Kullanıcı Ara").fill("ışık çalışkan");
    await expect(page.getByText(student.userName).locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("Banlı").locator("visible=true").first()).toBeVisible();

    await page.getByLabel("Kullanıcı Ara").fill("isik caliskan");
    await expect(page.getByText(student.userName).locator("visible=true").first()).toBeVisible();

    await page.getByLabel("Kullanıcı Ara").fill("kesinlikle-yok-boyle-biri");
    await expect(page.getByRole("heading", { name: "Eşleşen Kullanıcı Yok" })).toBeVisible();

    await page.getByLabel("Kullanıcı Ara").fill("");
    await page.getByRole("button", { name: /^Müdür/ }).click();
    await expect(page.getByRole("button", { name: /^Müdür/ })).toHaveAttribute("aria-pressed", "true");
  });
  test("liste sayfalanır, arama ve rol değişince ilk sayfaya döner", async ({ page }) => {
    await mudurSession(page);
    const stamp = Date.now().toString(36);
    for (let index = 0; index < 26; index += 1) {
      await createAccount("ogrenci", `sayfa${stamp}x${index}`);
    }
    await page.goto("/yonetim/kullanicilar");
    const search = page.getByLabel("Kullanıcı Ara");
    await search.fill(`sayfa${stamp}x`);

    const info = page.getByTestId("page-info");
    await expect(info).toHaveText("1–25 / 26");
    const rows = usesCards(page)
      ? page.getByRole("list", { name: "Kullanıcı kartları" }).getByRole("listitem")
      : page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(25);
    await expect(page.getByRole("button", { name: "Önceki Sayfa" })).toBeDisabled();

    await page.getByRole("button", { name: "Sayfa 2" }).click();
    await expect(info).toHaveText("26–26 / 26");
    await expect(rows).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Sayfa 2" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "Sonraki Sayfa" })).toBeDisabled();

    await search.fill(`sayfa${stamp}x1`);
    await expect(info).toHaveText(/^1–/);

    await search.fill(`sayfa${stamp}x`);
    await page.getByRole("button", { name: "Sayfa 2" }).click();
    await expect(info).toHaveText("26–26 / 26");
    await page.getByRole("button", { name: /^Öğretmen/ }).click();
    await expect(page.getByRole("heading", { name: "Eşleşen Kullanıcı Yok" })).toBeVisible();
    await page.getByRole("button", { name: /^Öğrenci/ }).click();
    await expect(info).toHaveText("1–25 / 26");
  });
});
