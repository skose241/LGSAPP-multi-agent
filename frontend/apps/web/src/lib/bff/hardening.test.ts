import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIpFromForwardedFor, resolveClientIp } from "./client-ip";
import { cookieNamesFor } from "./config";
import { isRequestTrusted } from "./csrf";
import { handleBffRequest, safeLocation } from "./handler";
import { sessionCookiesFromBody } from "./session";
import { bffStartupWarnings } from "./startup";
import { safeNextPath } from "../safe-path";

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.sig`;
}

describe("safeNextPath", () => {
  it("güvenli yolları korur", () => {
    expect(safeNextPath("/profil")).toBe("/profil");
    expect(safeNextPath("/profil?a=1#x")).toBe("/profil?a=1#x");
  });

  it.each([
    ["sekme", "/\t/kotu.site"],
    ["satır sonu", "/\n/kotu.site"],
    ["satır başı", "/\r/kotu.site"],
    ["boşluk", "/ /kotu.site"],
    ["ters eğik çizgi", "/\\kotu.site"],
    ["çift eğik çizgi", "//kotu.site"],
    ["https", "https://kotu.site"],
    ["javascript", "javascript:alert(1)"],
    ["nokta ile gizli çift eğik çizgi", "/.//kotu.site"],
    ["giriş", "/giris"],
    ["api", "/api/auth/me"],
    ["boş", ""],
  ])("%s reddedilir", (_name, value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it("kodlanmış sekme kodlu halde kalır ve kök dışına çıkmaz", () => {
    const result = safeNextPath("/%09/kotu.site");
    expect(result.startsWith("//")).toBe(false);
    expect(result.startsWith("/")).toBe(true);
  });

  it("URL'den çözülmüş değer de reddedilir", () => {
    const decoded = new URLSearchParams("next=%2F%09%2Fkotu.site").get("next");
    expect(safeNextPath(decoded)).toBe("/");
  });
});

describe("istemci IP güveni", () => {
  it("TRUST_PROXY kapalıyken XFF yok sayılır", () => {
    expect(resolveClientIp("1.2.3.4", { trustProxy: false, hops: 1 })).toBeNull();
  });

  it("açıkken sağdan hop kadar sayılır", () => {
    expect(resolveClientIp("9.9.9.9, 1.2.3.4, 5.6.7.8", { trustProxy: true, hops: 1 })).toBe("5.6.7.8");
    expect(resolveClientIp("9.9.9.9, 1.2.3.4, 5.6.7.8", { trustProxy: true, hops: 2 })).toBe("1.2.3.4");
    expect(clientIpFromForwardedFor("1.2.3.4", 2)).toBeNull();
  });
});

describe("CSRF sertleştirme", () => {
  it("cross-site ve same-site Origin eşleşse de reddedilir", () => {
    for (const site of ["cross-site", "same-site"]) {
      expect(isRequestTrusted({ method: "POST", origin: "http://a.test", secFetchSite: site, host: "a.test" })).toBe(false);
    }
  });

  it("APP_ORIGIN listesi şema dahil tam eşleşme ister", () => {
    const base = { method: "POST", secFetchSite: "same-origin", host: "uygulama.test", allowedOrigins: ["https://uygulama.test"] };
    expect(isRequestTrusted({ ...base, origin: "https://uygulama.test" })).toBe(true);
    expect(isRequestTrusted({ ...base, origin: "http://uygulama.test" })).toBe(false);
    expect(isRequestTrusted({ ...base, origin: "https://kotu.test" })).toBe(false);
  });

  it("liste yoksa Host karşılaştırması sürer", () => {
    expect(isRequestTrusted({ method: "POST", origin: "http://192.168.1.117:3000", secFetchSite: "same-origin", host: "192.168.1.117:3000" })).toBe(true);
  });
});

describe("çerez adları", () => {
  it("Secure açıkken __Host- öneki kullanılır", () => {
    expect(cookieNamesFor(true)).toEqual({ access: "__Host-lgs_oturum", refresh: "__Host-lgs_yenile" });
    expect(cookieNamesFor(false)).toEqual({ access: "lgs_oturum", refresh: "lgs_yenile" });
    const cookies = sessionCookiesFromBody(
      { token: "t", expiresAtUtc: new Date(Date.now() + 60_000).toISOString(), refreshToken: "r", refreshExpiresAtUtc: new Date(Date.now() + 60_000).toISOString() },
      true,
    );
    expect(cookies[0]).toMatch(/^__Host-lgs_oturum=/);
    expect(cookies[0]).toContain("Secure");
    expect(cookies[0]).toContain("Path=/");
    expect(cookies[1]).toMatch(/^__Host-lgs_yenile=/);
  });
});

describe("açılış uyarıları", () => {
  it("production dışında uyarı yoktur", () => {
    expect(bffStartupWarnings({ NODE_ENV: "development" })).toEqual([]);
  });

  it("production'da anahtar ve TRUST_PROXY eksikse uyarır", () => {
    expect(bffStartupWarnings({ NODE_ENV: "production" })).toHaveLength(2);
    expect(bffStartupWarnings({ NODE_ENV: "production", BFF_PROXY_KEY: "x", TRUST_PROXY: "true" })).toEqual([]);
  });
});

describe("Location", () => {
  it("yalnız göreli ya da kendi host'umuzdakini iletir", () => {
    expect(safeLocation("/giris", "a.test")).toBe("/giris");
    expect(safeLocation("https://a.test/x", "a.test")).toBe("https://a.test/x");
    expect(safeLocation("https://kotu.test/x", "a.test")).toBeNull();
    expect(safeLocation("//kotu.test", "a.test")).toBeNull();
  });
});

describe("BFF davranışları", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.API_BASE_URL = "http://api.test";
    process.env.BFF_PROXY_KEY = "k".repeat(32);
    process.env.SESSION_COOKIE_SECURE = "false";
    process.env.TRUST_PROXY = "false";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    delete process.env.TRUST_PROXY;
  });

  function refreshOk() {
    return new Response(
      JSON.stringify({
        token: fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
        expiresAtUtc: new Date(Date.now() + 3600_000).toISOString(),
        refreshToken: "yeni",
        refreshExpiresAtUtc: new Date(Date.now() + 86_400_000).toISOString(),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  const cookie = `lgs_oturum=${fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })}; lgs_yenile=eski`;

  it("refresh, logout ve logout-all yalnız POST kabul eder", async () => {
    for (const path of ["auth/refresh", "auth/logout", "auth/logout-all"]) {
      const request = new Request(`http://localhost:3000/api/${path}`, { headers: { host: "localhost:3000", cookie } });
      const response = await handleBffRequest(request, path.split("/"));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("TRUST_PROXY kapalıyken X-LGS-Client-IP gönderilmez", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    const request = new Request("http://localhost:3000/api/lessons", {
      headers: { host: "localhost:3000", "x-forwarded-for": "1.2.3.4", cookie },
    });
    await handleBffRequest(request, ["lessons"]);
    const headers = fetchMock.mock.calls[0]?.[1].headers as Headers;
    expect(headers.has("x-lgs-client-ip")).toBe(false);
    expect(headers.get("x-lgs-proxy-key")).toBe("k".repeat(32));
  });

  it("küçük JSON gövdesinde 401 gelirse oturumu yenileyip bir kez tekrar dener", async () => {
    let calls = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (String(url).endsWith("/api/auth/refresh")) return refreshOk();
      calls += 1;
      if (calls === 1) return new Response(null, { status: 401 });
      expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"a":1}');
      return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
    });
    const body = '{"a":1}';
    const request = new Request("http://localhost:3000/api/comments", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
        "content-length": String(body.length),
        cookie,
      },
      body,
    });
    const response = await handleBffRequest(request, ["comments"]);
    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    expect(response.headers.getSetCookie().some((c) => c.startsWith("lgs_oturum="))).toBe(true);
  });

  it("multipart gövdede yenileme başarılıysa x-session-refreshed başlıklı yanıt döner", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/api/auth/refresh")) return refreshOk();
      return new Response(null, { status: 401 });
    });
    const request = new Request("http://localhost:3000/api/files", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "multipart/form-data; boundary=x",
        "content-length": "50",
        cookie,
      },
      body: "--x\r\n\r\n--x--",
    });
    const response = await handleBffRequest(request, ["files"]);
    expect(response.headers.get("x-session-refreshed")).toBe("1");
    expect(response.headers.getSetCookie().some((c) => c.startsWith("lgs_oturum="))).toBe(true);
    const apiCalls = fetchMock.mock.calls.filter((call) => !String(call[0]).endsWith("/api/auth/refresh"));
    expect(apiCalls).toHaveLength(1);
  });

  it("geçici yenileme hatasında 401 yerine gerçek durum iletilir ve çerez silinmez", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/api/auth/refresh")) return new Response("{}", { status: 503 });
      return new Response(null, { status: 401 });
    });
    const request = new Request("http://localhost:3000/api/lessons", { headers: { host: "localhost:3000", cookie } });
    const response = await handleBffRequest(request, ["lessons"]);
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("12 MB üstü Content-Length 413 alır", async () => {
    const request = new Request("http://localhost:3000/api/files", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-length": String(13 * 1024 * 1024), cookie },
      body: "x",
    });
    const response = await handleBffRequest(request, ["files"]);
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("problem+json olmayan 5xx gövdesi sabit mesajla değişir", async () => {
    fetchMock.mockResolvedValue(new Response("<html>hata ayrıntısı</html>", { status: 500, headers: { "content-type": "text/html" } }));
    const request = new Request("http://localhost:3000/api/lessons", { headers: { host: "localhost:3000", cookie } });
    const response = await handleBffRequest(request, ["lessons"]);
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(text).not.toContain("ayrıntısı");
    expect(text).toContain("Sunucuda beklenmeyen bir hata oluştu.");
  });

  it("dış origin'e giden Location iletilmez", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201, headers: { location: "https://kotu.test/x" } }));
    const request = new Request("http://localhost:3000/api/comments", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json", "content-length": "2", cookie },
      body: "{}",
    });
    const response = await handleBffRequest(request, ["comments"]);
    expect(response.headers.get("location")).toBeNull();
  });
});
