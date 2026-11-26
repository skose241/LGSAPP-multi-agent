import { expect, test } from "./support/fixtures";

test("/manifest.webmanifest oturumsuz JSON ve ikonlarla döner", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("manifest+json");
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.lang).toBe("tr");
  const purposes = manifest.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes}:${icon.purpose}`);
  expect(purposes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const icon of manifest.icons as { src: string }[]) {
    const iconResponse = await request.get(icon.src, { maxRedirects: 0 });
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()["content-type"]).toContain("image/png");
  }
});

test("/sw.js ve /offline.html oturumsuz erişilebilir, sw.js önbelleğe alınmaz", async ({ request }) => {
  const worker = await request.get("/sw.js", { maxRedirects: 0 });
  expect(worker.status()).toBe(200);
  expect(worker.headers()["content-type"]).toContain("javascript");
  expect(worker.headers()["cache-control"]).toContain("no-cache");
  const offline = await request.get("/offline.html", { maxRedirects: 0 });
  expect(offline.status()).toBe(200);
  expect(offline.headers()["content-type"]).toContain("text/html");
});

test("kök düzen apple-touch-icon ve appleWebApp meta etiketlerini içerir", async ({ page }) => {
  await page.goto("/giris");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "LGS Hazırlık");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
});
