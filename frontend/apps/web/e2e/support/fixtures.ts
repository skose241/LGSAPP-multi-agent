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
    const violations: string[] = [];
    await context.exposeBinding("__reportCspViolation", (_source, detail: string) => {
      violations.push(detail);
    });
    await context.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        const report = (window as unknown as { __reportCspViolation?: (detail: string) => void }).__reportCspViolation;
        report?.(`${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`);
      });
    });
    page.on("console", (message) => {
      if (message.type() === "error" && /content security policy|content-security-policy/i.test(message.text())) {
        violations.push(`console: ${message.text()}`);
      }
    });
    await use(page);
    expect(violations, "CSP ihlali").toEqual([]);
  },
});

export { expect };

export function baseOrigin(): string {
  return `http://localhost:${process.env.E2E_PORT ?? 3100}`;
}

export async function attemptLogin(page: Page, userName: string, password: string) {
  await page.goto("/giris");
  await page.getByLabel("Kullanıcı Adı").fill(userName);
  await page.getByLabel(/^Şifre\*?$/).fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
}

export async function login(page: Page, userName: string, password: string) {
  await attemptLogin(page, userName, password);
  await page.waitForURL((url) => !url.pathname.startsWith("/giris"), { timeout: 20_000 });
}

export async function logoutViaUi(page: Page) {
  const sidebarButton = page.getByRole("button", { name: "Çıkış Yap" });
  if (!(await sidebarButton.first().isVisible())) {
    await page.goto("/profil");
  }
  await page.getByRole("button", { name: "Çıkış Yap" }).locator("visible=true").first().click();
  await page.waitForURL(/\/giris/);
}
