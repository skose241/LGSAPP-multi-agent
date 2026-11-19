import { expect, test } from "./support/fixtures";

test("belge yanıtında güvenlik başlıkları ve nonce'lu CSP bulunur", async ({ page }) => {
  const response = await page.goto("/giris");
  const headers = response!.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  const csp = headers["content-security-policy"];
  expect(csp).toBeTruthy();
  expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("report-uri /csp-report");
  expect(csp).toContain("report-to csp");
  expect(headers["reporting-endpoints"]).toBe('csp="/csp-report"');
  expect(csp).toContain("img-src 'self' blob: data: http://127.0.0.1:10000");
  const nonceScripts = await page.locator("script[nonce]").count();
  expect(nonceScripts).toBeGreaterThan(0);
});

test("/healthz oturumsuz 200 ve önbelleksiz döner", async ({ request }) => {
  const response = await request.get("/healthz", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
});

test("/csp-report oturumsuz örnek raporu 204 ile kabul eder", async ({ request }) => {
  const report = { "csp-report": { "document-uri": "http://localhost/giris?x=1", "violated-directive": "img-src", "blocked-uri": "https://example.test/a.png" } };
  const response = await request.post("/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: JSON.stringify(report),
    maxRedirects: 0,
  });
  expect(response.status()).toBe(204);
  const api = await request.post("/csp-report", {
    headers: { "content-type": "application/reports+json" },
    data: JSON.stringify([{ type: "csp-violation", body: { effectiveDirective: "img-src" } }]),
    maxRedirects: 0,
  });
  expect(api.status()).toBe(204);
});

test("/csp-report büyük gövdede 413 döner", async ({ request }) => {
  const response = await request.post("/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: "x".repeat(20 * 1024),
    maxRedirects: 0,
  });
  expect(response.status()).toBe(413);
});
