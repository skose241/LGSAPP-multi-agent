import type { Page } from "@playwright/test";
import { activateAccount, createAccount, randomIp, VALID_PASSWORD } from "./support/backend";
import { attemptLogin, baseOrigin, expect, login, test } from "./support/fixtures";

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.imza`;
}

async function student() {
  const account = await createAccount("ogrenci");
  await activateAccount(account);
  return { ...account, password: VALID_PASSWORD };
}

async function logoutAllViaUi(page: Page) {
  const sidebarButton = page.getByRole("button", { name: "Tüm Cihazlardan Çık" });
  if (!(await sidebarButton.first().isVisible())) {
    await page.goto("/profil");
  }
  await page.getByRole("button", { name: "Tüm Cihazlardan Çık" }).locator("visible=true").first().click();
  await page.waitForURL(/\/giris/);
}

test.describe("open redirect", () => {
  for (const [name, next] of [
    ["sekme", "%2F%09%2Fkotu.site"],
    ["ters eğik çizgi", "%2F%5Ckotu.site"],
    ["çift eğik çizgi", "%2F%2Fkotu.site"],
    ["satır sonu", "%2F%0A%2Fkotu.site"],
  ] as const) {
    test(`next=${name} kendi sitemizin dışına çıkarmaz`, async ({ page }) => {
      const account = await student();
      await page.goto(`/giris?next=${next}`);
      await page.getByLabel("Kullanıcı Adı").fill(account.userName);
      await page.getByLabel(/^Şifre\*?$/).fill(account.password);
      await page.getByRole("button", { name: "Giriş Yap" }).click();
      await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
      expect(new URL(page.url()).origin).toBe(baseOrigin());
      expect(page.url()).not.toContain("kotu.site");
    });
  }
});

test.describe("oturum yenileme", () => {
  test("sahte erişim çerezinde gövdeli JSON isteği yenilenip yeniden denenir", async ({ page, context, clientIp }) => {
    const account = await student();
    await login(page, account.userName, account.password);
    const forged = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    await context.addCookies([{ name: "lgs_oturum", value: forged, url: baseOrigin(), httpOnly: true, sameSite: "Lax" }]);

    const response = await page.request.post("/api/auth/change-password", {
      headers: { origin: baseOrigin(), "x-forwarded-for": clientIp },
      data: { currentPassword: "Yanlis-Sifre-1", newPassword: "Yeni-Sifre-2026-Zz" },
    });
    expect(response.status()).toBe(400);
    const setCookie = (await response.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
    expect(setCookie.some((value) => value.startsWith("lgs_oturum=") && !value.includes(forged))).toBe(true);
  });

  test("multipart istekte 401 yerine x-session-refreshed başlıklı yanıt döner", async ({ page, context, clientIp }) => {
    const account = await student();
    await login(page, account.userName, account.password);
    const forged = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    await context.addCookies([{ name: "lgs_oturum", value: forged, url: baseOrigin(), httpOnly: true, sameSite: "Lax" }]);

    const response = await page.request.post("/api/auth/change-password", {
      headers: { origin: baseOrigin(), "x-forwarded-for": clientIp },
      multipart: { alan: "deger" },
    });
    expect(response.status()).toBe(401);
    expect(response.headers()["x-session-refreshed"]).toBe("1");
    const setCookie = (await response.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
    expect(setCookie.some((value) => value.startsWith("lgs_oturum=") && !value.includes(forged))).toBe(true);

    await page.goto("/profil");
    await expect(page.getByRole("heading", { name: "Profil" })).toBeVisible();
  });

  test("refresh, logout ve logout-all GET ile 405 döner", async ({ page, clientIp }) => {
    await page.goto("/giris");
    for (const path of ["/api/auth/refresh", "/api/auth/logout", "/api/auth/logout-all"]) {
      const response = await page.request.get(path, { headers: { "x-forwarded-for": clientIp } });
      expect(response.status()).toBe(405);
    }
  });

  test("Sec-Fetch-Site cross-site olan istek Origin eşleşse de reddedilir", async ({ page, clientIp }) => {
    await page.goto("/giris");
    const response = await page.request.post("/api/auth/login", {
      headers: { origin: baseOrigin(), "sec-fetch-site": "cross-site", "x-forwarded-for": clientIp },
      data: { userName: "a.b.c", password: "Abcdefg1" },
    });
    expect(response.status()).toBe(403);
  });

  test("13 MB Content-Length 413 döner", async ({ page, clientIp }) => {
    await page.goto("/giris");
    const response = await page.request.post("/api/auth/login", {
      headers: { origin: baseOrigin(), "x-forwarded-for": clientIp, "content-type": "application/octet-stream" },
      data: Buffer.alloc(13 * 1024 * 1024),
    });
    expect(response.status()).toBe(413);
  });
});

test.describe("tüm cihazlardan çıkış", () => {
  test("bir bağlamdaki çıkış diğer bağlamı, erişim çerezi geçerliyken de, girişe düşürür", async ({ page, browser, baseURL }) => {
    const account = await student();
    await login(page, account.userName, account.password);

    const otherContext = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "x-forwarded-for": randomIp() },
    });
    try {
      const other = await otherContext.newPage();
      await attemptLogin(other, account.userName, account.password);
      await other.waitForURL((url) => !url.pathname.startsWith("/giris"), { timeout: 20_000 });
      await expect(other.getByRole("heading", { name: /Merhaba/ })).toBeVisible();

      const access = (await otherContext.cookies()).find((cookie) => cookie.name === "lgs_oturum");
      expect(access).toBeTruthy();
      expect(access?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 60);

      await logoutAllViaUi(page);

      await other.goto("/profil");
      await other.waitForURL(/\/giris\?neden=oturum/);
      await expect(other.getByText("Oturumunuzun süresi doldu.")).toBeVisible();
      const names = (await otherContext.cookies()).map((cookie) => cookie.name);
      expect(names).not.toContain("lgs_oturum");
      expect(names).not.toContain("lgs_yenile");
    } finally {
      await otherContext.close();
    }
  });
});
