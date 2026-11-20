import type { Page } from "@playwright/test";
import { activateAccount, createAccount, VALID_PASSWORD } from "./support/backend";
import { expect, login, test } from "./support/fixtures";
import { expectClearOfTabBar } from "./support/layout";

async function mudurSession(page: Page) {
  const account = await createAccount("mudur");
  await activateAccount(account);
  await login(page, account.userName, VALID_PASSWORD);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
}

test.describe("alt sekme çubuğu boşluğu", () => {
  test("yeni kullanıcı başarı ekranı", async ({ page }, testInfo) => {
    await mudurSession(page);
    await page.goto("/yonetim/kullanicilar/yeni");
    await page.getByLabel(/^Kullanıcı Adı\*?$/).fill(`alt.${Date.now().toString(36)}`);
    await page.getByLabel(/^Ad\*?$/).fill("Alt");
    await page.getByLabel(/^Soyad\*?$/).fill("Boşluk");
    await page.getByRole("button", { name: "Hesap Oluştur" }).click();
    await expect(page.getByTestId("one-time-password")).toBeVisible();
    await expectClearOfTabBar(page, "tek-seferlik-sifre", testInfo.project.name);
  });

  test("kullanıcı detayı", async ({ page }, testInfo) => {
    await mudurSession(page);
    const teacher = await createAccount("ogretmen");
    await activateAccount(teacher);
    await page.goto(`/yonetim/kullanicilar/${teacher.id}`);
    await expect(page.getByTestId("action-branch")).toBeVisible();
    await expectClearOfTabBar(page, "kullanici-detay", testInfo.project.name);
  });

  test("profil", async ({ page }, testInfo) => {
    await mudurSession(page);
    await page.goto("/profil");
    await expect(page.getByRole("heading", { name: "Profil" })).toBeVisible();
    await expectClearOfTabBar(page, "profil", testInfo.project.name);
  });

  test("pano", async ({ page }, testInfo) => {
    await mudurSession(page);
    await expectClearOfTabBar(page, "pano", testInfo.project.name);
  });
});
