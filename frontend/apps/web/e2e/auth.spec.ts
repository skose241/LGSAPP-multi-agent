import type { Page } from "@playwright/test";
import {
  activateAccount,
  backend,
  banAccount,
  createAccount,
  exhaustRecoveryCodes,
  VALID_PASSWORD,
} from "./support/backend";
import { attemptLogin, baseOrigin, expect, login, logoutViaUi, test } from "./support/fixtures";

const NEW_PASSWORD = "Yeni-Sifre-2026-Zz";

async function fillChangePassword(page: Page, current: string, next: string) {
  await page.getByLabel("Mevcut şifre").fill(current);
  await page.getByLabel(/^Yeni şifre\*?$/).fill(next);
  await page.getByLabel("Yeni şifre (tekrar)").fill(next);
  await page.getByRole("button", { name: /Şifreyi (kaydet|değiştir)/ }).click();
}

async function activatedAccount(role: "ogrenci" | "ogretmen" | "mudur") {
  const account = await createAccount(role);
  const { recoveryCodes } = await activateAccount(account);
  return { ...account, password: VALID_PASSWORD, recoveryCodes };
}

test.describe("giriş", () => {
  test("yanlış şifrede sunucu mesajı gösterilir", async ({ page }) => {
    const account = await activatedAccount("ogrenci");
    await attemptLogin(page, account.userName, "Yanlis-Sifre-1");
    await expect(page.getByTestId("problem-banner")).toContainText("Kullanıcı adı veya şifre hatalı.");
    await expect(page).toHaveURL(/\/giris/);
  });

  test("429 sonrası geri sayım gösterilir ve azalır", async ({ page, clientIp }) => {
    const origin = baseOrigin();
    for (let index = 0; index < 11; index += 1) {
      await page.request.post("/api/auth/login", {
        headers: { origin, "x-forwarded-for": clientIp },
        data: { userName: "yok.kullanici", password: "Yanlis-1" },
      });
    }
    await page.goto("/giris");
    await page.getByLabel("Kullanıcı adı").fill("yok.kullanici");
    await page.getByLabel(/^Şifre\*?$/).fill("Yanlis-1");
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await expect(page.getByTestId("problem-banner")).toContainText("Çok fazla deneme yapıldı");
    const waiting = page.getByRole("button", { name: /Bekle \(\d+\)/ });
    await expect(waiting).toBeDisabled();
    const readSeconds = async () => Number(/\((\d+)\)/.exec((await waiting.textContent()) ?? "")?.[1] ?? "0");
    const first = await readSeconds();
    await page.waitForTimeout(2200);
    expect(await readSeconds()).toBeLessThan(first);
  });

  test("bozuk JSON gövdesinde form hatası gösterilir", async ({ page }) => {
    await page.route("**/api/auth/login", (route) => route.continue({ postData: "{bozuk", headers: { ...route.request().headers(), "content-type": "application/json" } }));
    await page.goto("/giris");
    await page.getByLabel("Kullanıcı adı").fill("herhangi.biri");
    await page.getByLabel(/^Şifre\*?$/).fill("Herhangi-1");
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    const alert = page.getByTestId("problem-banner");
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText("Kullanıcı adı veya şifre hatalı.");
    await expect(alert).not.toBeEmpty();
  });

  test("backend bozuk JSON için errors anahtarını boş string döner", async ({ page, clientIp }) => {
    const response = await page.request.post("/api/auth/login", {
      headers: { origin: baseOrigin(), "x-forwarded-for": clientIp, "content-type": "application/json" },
      data: "{bozuk",
    });
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { errors?: Record<string, string[]> };
    expect(Object.keys(body.errors ?? {})).toContain("");
  });

  test("ilk girişte şifre değişimi zorunlu, diğer sayfalar kilitli", async ({ page }) => {
    const account = await createAccount("ogrenci");
    await login(page, account.userName, account.oneTimePassword);
    await expect(page).toHaveURL(/\/sifre-degistir/);

    await page.goto("/profil");
    await expect(page).toHaveURL(/\/sifre-degistir/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/sifre-degistir/);

    await page.getByLabel("Mevcut şifre").fill(account.oneTimePassword);
    await page.getByLabel(/^Yeni şifre\*?$/).fill("kisa");
    await page.getByLabel("Yeni şifre (tekrar)").fill("kisa");
    await page.getByRole("button", { name: "Şifreyi kaydet" }).click();
    await expect(page.getByText("En az 8 karakter olmalı.")).toBeVisible();

    await fillChangePassword(page, account.oneTimePassword, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await page.goto("/sifre-degistir");
    await expect(page).toHaveURL(/\/$/);
  });

  test("müdür ilk girişinde 10 kurtarma kodu tek seferlik gösterilir", async ({ page }) => {
    const account = await createAccount("mudur");
    await login(page, account.userName, account.oneTimePassword);
    await expect(page).toHaveURL(/\/sifre-degistir/);
    await page.getByLabel("Mevcut şifre").fill(account.oneTimePassword);
    await page.getByLabel(/^Yeni şifre\*?$/).fill("Kisa-Sifre1");
    await page.getByLabel("Yeni şifre (tekrar)").fill("Kisa-Sifre1");
    await page.getByRole("button", { name: "Şifreyi kaydet" }).click();
    await expect(page.getByText("En az 12 karakter olmalı.")).toBeVisible();

    await fillChangePassword(page, account.oneTimePassword, "Mudur-Uzun-Sifre-2026");
    await expect(page).toHaveURL(/\/kurtarma-kodlari\/yeni/);
    const codes = page.getByTestId("recovery-codes").getByRole("listitem");
    await expect(codes).toHaveCount(10);
    const first = (await codes.first().textContent()) ?? "";
    expect(first).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const confirm = page.getByRole("button", { name: "Devam et" });
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Kodları güvenli bir yere kaydettim").check();
    await expect(confirm).toBeEnabled();

    const storage = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]));
    expect(storage).not.toContain(first);

    await page.reload();
    await expect(page).toHaveURL(/\/profil\/kurtarma-kodlari/);
    await expect(page.getByTestId("recovery-codes")).toHaveCount(0);
  });

  test("recoveryCodesMissing müdürü kurtarma kodları sayfasına zorlar", async ({ page }) => {
    const account = await createAccount("mudur");
    const { recoveryCodes } = await activateAccount(account);
    await exhaustRecoveryCodes(account.userName, recoveryCodes);

    const password = `${VALID_PASSWORD}${recoveryCodes.length - 1}`;
    await login(page, account.userName, password);
    await expect(page).toHaveURL(/\/profil\/kurtarma-kodlari/);
    await page.goto("/profil");
    await expect(page).toHaveURL(/\/profil\/kurtarma-kodlari/);

    await page.getByLabel("Mevcut şifre").fill(password);
    await page.getByRole("button", { name: "Yeni kodlar üret" }).click();
    await expect(page.getByTestId("recovery-codes").getByRole("listitem")).toHaveCount(10);
    await page.getByLabel("Kodları güvenli bir yere kaydettim").check();
    await page.getByRole("button", { name: "Kaydettim, kapat" }).click();
    await page.goto("/profil");
    await expect(page).toHaveURL(/\/profil$/);
  });

  test("mevcut şifre yanlışsa kurtarma kodu üretimi sunucu mesajını gösterir", async ({ page }) => {
    const account = await activatedAccount("mudur");
    await login(page, account.userName, account.password);
    await page.goto("/profil/kurtarma-kodlari");
    await page.getByLabel("Mevcut şifre").fill("Yanlis-Sifre-123");
    await page.getByRole("button", { name: "Yeni kodlar üret" }).click();
    await expect(page.getByTestId("problem-banner")).toContainText("Mevcut şifre hatalı.");
  });
});

test.describe("oturum", () => {
  test("çıkış çerezleri siler ve korumalı sayfalar kapanır", async ({ page, context }) => {
    const account = await activatedAccount("ogrenci");
    await login(page, account.userName, account.password);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await logoutViaUi(page);
    const names = (await context.cookies()).map((cookie) => cookie.name);
    expect(names).not.toContain("lgs_oturum");
    expect(names).not.toContain("lgs_yenile");
    await page.goto("/profil");
    await expect(page).toHaveURL(/\/giris\?next=%2Fprofil/);
  });

  test("erişim çerezi silinince yenileme çerezi oturumu sürdürür", async ({ page, context }) => {
    const account = await activatedAccount("ogrenci");
    await login(page, account.userName, account.password);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    const before = (await context.cookies()).find((cookie) => cookie.name === "lgs_oturum")?.value;
    expect(before).toBeTruthy();

    await context.clearCookies({ name: "lgs_oturum" });
    await page.goto("/profil");
    await expect(page.getByRole("heading", { name: "Profil" })).toBeVisible();
    await expect(page.getByText(account.userName)).toBeVisible();
    const after = (await context.cookies()).find((cookie) => cookie.name === "lgs_oturum")?.value;
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  test("müdür öğrenciyi banlayınca öğrenci bir sonraki istekte girişe atılır", async ({ page }) => {
    const account = await activatedAccount("ogrenci");
    await login(page, account.userName, account.password);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await banAccount(account.id);
    await page.goto("/profil").catch((error: Error) => {
      if (!/ERR_ABORTED|interrupted/.test(error.message)) throw error;
    });
    await page.waitForURL(/\/giris\?neden=oturum/);
    await expect(page.getByText("Oturumunuzun süresi doldu.")).toBeVisible();
    await page.goto("/");
    await expect(page).toHaveURL(/\/giris/);
  });

  test("token'lar document.cookie ve depolamada bulunmaz, çerez bayrakları doğru", async ({ page, context }) => {
    const account = await activatedAccount("ogrenci");
    const loginResponse = page.waitForResponse((response) => response.url().endsWith("/api/auth/login"));
    await login(page, account.userName, account.password);
    const loginResult = await loginResponse;
    const body = await loginResult.text();
    const setCookie = (await loginResult.allHeaders())["set-cookie"] ?? "";
    expect(setCookie.match(/HttpOnly/gi)).toHaveLength(2);
    expect(setCookie.match(/SameSite=Lax/gi)).toHaveLength(2);
    expect(setCookie).not.toMatch(/;\s*Secure/i);
    expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(body).not.toContain("refreshToken\":\"");
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();

    const exposed = await page.evaluate(() => JSON.stringify([document.cookie, { ...localStorage }, { ...sessionStorage }]));
    expect(exposed).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(exposed).not.toContain("lgs_");

    const cookies = await context.cookies();
    const access = cookies.find((cookie) => cookie.name === "lgs_oturum");
    const refresh = cookies.find((cookie) => cookie.name === "lgs_yenile");
    expect(access?.httpOnly).toBe(true);
    expect(refresh?.httpOnly).toBe(true);
    expect(access?.secure).toBe(false);
    expect(refresh?.path).toBe("/");
  });

  test("başka Origin'den gelen POST 403 alır", async ({ page, clientIp }) => {
    await page.goto("/giris");
    const response = await page.request.post("/api/auth/login", {
      headers: { origin: "https://kotu.example", "x-forwarded-for": clientIp },
      data: { userName: "a.b.c", password: "Abcdefg1" },
    });
    expect(response.status()).toBe(403);
    const noOrigin = await page.request.post("/api/auth/logout", { headers: { "x-forwarded-for": clientIp }, data: {} });
    expect(noOrigin.status()).toBe(403);
  });
});

test.describe("rol bazlı yönlendirme", () => {
  test("çerezsiz kullanıcı girişe gider ve girişten sonra hedefe döner", async ({ page }) => {
    const account = await activatedAccount("ogrenci");
    await page.goto("/profil");
    await expect(page).toHaveURL(/\/giris\?next=%2Fprofil/);
    await page.getByLabel("Kullanıcı adı").fill(account.userName);
    await page.getByLabel(/^Şifre\*?$/).fill(account.password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await expect(page).toHaveURL(/\/profil$/);
    await page.goto("/giris");
    await expect(page).toHaveURL(/\/$/);
  });

  test("öğrenci yönetim ve öğretmen sayfalarına giremez", async ({ page }) => {
    const account = await activatedAccount("ogrenci");
    await login(page, account.userName, account.password);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await page.goto("/yonetim/kullanicilar");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/ogretmen/odevler");
    await expect(page).toHaveURL(/\/$/);
  });

  test("öğretmen öğretmen sayfasını görür, yönetime giremez", async ({ page }) => {
    const account = await activatedAccount("ogretmen");
    await login(page, account.userName, account.password);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await page.goto("/ogretmen/odevler");
    await expect(page.getByRole("heading", { name: "Ödev Yönetimi", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Yeni ödev" }).first()).toBeVisible();
    await page.goto("/yonetim/ayarlar");
    await expect(page).toHaveURL(/\/$/);
  });

  test("müdür yönetim ve öğretmen sayfalarını görür", async ({ page }) => {
    const account = await activatedAccount("mudur");
    await login(page, account.userName, account.password);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await page.goto("/yonetim/kullanicilar");
    await expect(page.getByRole("heading", { name: "Kullanıcılar" })).toBeVisible();
    await page.goto("/ogretmen/sikayetler");
    await expect(page.getByRole("heading", { name: "Şikâyetler" })).toBeVisible();
  });

  test("bilinmeyen yol 404 verir", async ({ page }) => {
    const account = await activatedAccount("ogrenci");
    await login(page, account.userName, account.password);
    await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
    await page.goto("/yok-boyle-bir-sayfa");
    await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
  });
});

test.describe("şifremi unuttum ve kurtarma", () => {
  test("her durumda aynı mesaj gösterilir", async ({ page }) => {
    const account = await activatedAccount("ogrenci");
    for (const userName of [account.userName, "hic.yok.boyle.biri"]) {
      await page.goto("/sifremi-unuttum");
      await page.getByLabel("Kullanıcı adı").fill(userName);
      await page.getByRole("button", { name: "Talep gönder" }).click();
      await expect(page.getByRole("status")).toContainText("Talebiniz okul yönetimine iletildi.");
      await expect(page.getByRole("status")).toContainText("Müdür onaylayınca");
    }
  });

  test("müdür kurtarma kodu ile şifre yeniler ve kalan kod sayısını görür", async ({ page }) => {
    const account = await activatedAccount("mudur");
    await page.goto("/kurtarma");
    await page.getByLabel("Kullanıcı adı").fill(account.userName);
    const codeInput = page.getByLabel("Kurtarma kodu");
    await codeInput.fill(account.recoveryCodes[0]!.replaceAll("-", "").toLowerCase());
    await expect(codeInput).toHaveValue(account.recoveryCodes[0]!);
    await page.getByLabel("Yeni şifre").fill("Kurtarma-Sonrasi-Sifre-1");
    await page.getByRole("button", { name: "Şifremi yenile" }).click();
    await expect(page.getByRole("status")).toContainText("Kalan kurtarma kodu sayısı: 9");
    const wrong = await backend("POST", "/api/auth/recover", {
      body: { userName: account.userName, recoveryCode: account.recoveryCodes[0], newPassword: "Baska-Uzun-Sifre-12" },
    });
    expect(wrong.status).toBe(400);
  });
});
