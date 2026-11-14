import { expect, test as base, type Page } from "@playwright/test";
import { randomIp } from "./backend";

interface Fixtures {
  clientIp: string;
}

export const test = base.extend<Fixtures>({
  clientIp: async ({ baseURL }, use) => {
    void baseURL;
    await use(randomIp());
  },
  page: async ({ page, context, clientIp }, use) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": clientIp });
    await use(page);
  },
});

export { expect };

export function baseOrigin(): string {
  return `http://localhost:${process.env.E2E_PORT ?? 3100}`;
}

export async function attemptLogin(page: Page, userName: string, password: string) {
  await page.goto("/giris");
  await page.getByLabel("Kullanıcı adı").fill(userName);
  await page.getByLabel(/^Şifre\*?$/).fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
}

export async function login(page: Page, userName: string, password: string) {
  await attemptLogin(page, userName, password);
  await page.waitForURL((url) => !url.pathname.startsWith("/giris"), { timeout: 20_000 });
}

export async function logoutViaUi(page: Page) {
  const sidebarButton = page.getByRole("button", { name: "Çıkış yap" });
  if (!(await sidebarButton.first().isVisible())) {
    await page.goto("/profil");
  }
  await page.getByRole("button", { name: "Çıkış yap" }).locator("visible=true").first().click();
  await page.waitForURL(/\/giris/);
}
