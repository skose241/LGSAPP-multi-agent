import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIpFromForwardedFor } from "./client-ip";
import { clearCookie, parseCookieHeader, serializeCookie } from "./cookies";
import { isRequestTrusted } from "./csrf";
import { handleBffRequest } from "./handler";
import { refreshSession } from "./refresh";
import { clearSessionCookies, sessionCookiesFromBody, stripTokens } from "./session";

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.sig`;
}

describe("cookies", () => {
  it("HttpOnly ve SameSite=Lax yazar, Secure ayarla gelir", () => {
    const secure = serializeCookie({ name: "a", value: "b c", maxAge: 120.9, secure: true });
    expect(secure).toContain("a=b%20c");
    expect(secure).toContain("Max-Age=120");
    expect(secure).toContain("HttpOnly");
    expect(secure).toContain("SameSite=Lax");
    expect(secure).toContain("Secure");
    expect(serializeCookie({ name: "a", value: "b", maxAge: 1, secure: false })).not.toContain("Secure");
  });

  it("silme çerezi Max-Age=0 olur", () => {
    expect(clearCookie("x", false)).toContain("Max-Age=0");
  });

  it("çerez başlığını çözer", () => {
    expect(parseCookieHeader("a=1; b=%C5%9F; c")).toEqual({ a: "1", b: "ş" });
    expect(parseCookieHeader(null)).toEqual({});
  });
});

describe("oturum çerezleri", () => {
  const now = new Date("2026-11-14T10:00:00Z");

  it("access ve refresh çerezlerini süreleriyle yazar", () => {
    const cookies = sessionCookiesFromBody(
      {
        token: "tok",
        expiresAtUtc: "2026-11-14T11:00:00Z",
        refreshToken: "ref",
        refreshExpiresAtUtc: "2026-11-15T10:00:00Z",
      },
      false,
      now,
    );
    expect(cookies[0]).toContain("lgs_oturum=tok");
    expect(cookies[0]).toContain("Max-Age=3600");
    expect(cookies[1]).toContain("lgs_yenile=ref");
    expect(cookies[1]).toContain("Path=/");
    expect(cookies[1]).toContain("Max-Age=86400");
  });

  it("refreshToken null ise yenileme çerezini siler", () => {
    const cookies = sessionCookiesFromBody({ token: "tok", expiresAtUtc: "2026-11-14T11:00:00Z", refreshToken: null }, false, now);
    expect(cookies[1]).toContain("lgs_yenile=;");
    expect(cookies[1]).toContain("Max-Age=0");
  });

  it("token alanlarını gövdeden çıkarır", () => {
    expect(stripTokens({ token: "a", refreshToken: "b", user: { id: 1 }, recoveryCodes: ["X"] })).toEqual({
      user: { id: 1 },
      recoveryCodes: ["X"],
    });
  });

  it("iki çerezi de temizler", () => {
    expect(clearSessionCookies(true)).toHaveLength(2);
  });
});

describe("istemci IP", () => {
  it("en sağdaki girdiyi alır", () => {
    expect(clientIpFromForwardedFor("1.1.1.1, 2.2.2.2")).toBe("2.2.2.2");
  });

  it("portu atar", () => {
    expect(clientIpFromForwardedFor("203.0.113.5:4711")).toBe("203.0.113.5");
    expect(clientIpFromForwardedFor("[2001:db8::1]:443")).toBe("2001:db8::1");
  });

  it("çıplak IPv6 ve geçersiz değerleri işler", () => {
    expect(clientIpFromForwardedFor("::1")).toBe("::1");
    expect(clientIpFromForwardedFor("bozuk")).toBeNull();
    expect(clientIpFromForwardedFor(null)).toBeNull();
  });
});

describe("CSRF", () => {
  it("okuma isteklerine izin verir", () => {
    expect(isRequestTrusted({ method: "GET", origin: null, secFetchSite: null, host: "a" })).toBe(true);
  });

  it("aynı host Origin kabul edilir, LAN IP dahil", () => {
    expect(isRequestTrusted({ method: "POST", origin: "http://192.168.1.117:3000", secFetchSite: null, host: "192.168.1.117:3000" })).toBe(true);
  });

  it("başka Origin reddedilir", () => {
    expect(isRequestTrusted({ method: "POST", origin: "https://kotu.example", secFetchSite: "cross-site", host: "app.example" })).toBe(false);
    expect(isRequestTrusted({ method: "POST", origin: "null", secFetchSite: null, host: "app.example" })).toBe(false);
  });

  it("Origin yoksa Sec-Fetch-Site same-origin aranır", () => {
    expect(isRequestTrusted({ method: "DELETE", origin: null, secFetchSite: "same-origin", host: "a" })).toBe(true);
    expect(isRequestTrusted({ method: "DELETE", origin: null, secFetchSite: "cross-site", host: "a" })).toBe(false);
    expect(isRequestTrusted({ method: "POST", origin: null, secFetchSite: null, host: "a" })).toBe(false);
  });
});

describe("refresh ve yönlendirme", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.API_BASE_URL = "http://api.test";
    process.env.BFF_PROXY_KEY = "k".repeat(32);
    process.env.SESSION_COOKIE_SECURE = "false";
    process.env.TRUST_PROXY = "true";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  function loginBody(token: string) {
    return {
      token,
      expiresAtUtc: new Date(Date.now() + 3600_000).toISOString(),
      refreshToken: "yeni-yenile",
      refreshExpiresAtUtc: new Date(Date.now() + 86_400_000).toISOString(),
      mustChangePassword: false,
      user: { id: 1 },
    };
  }

  it("aynı refresh token için tek istek yapılır", async () => {
    fetchMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(JSON.stringify(loginBody("a")), { status: 200, headers: { "content-type": "application/json" } });
    });
    const [one, two] = await Promise.all([refreshSession("eski", "1.2.3.4"), refreshSession("eski", "1.2.3.4")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(one.ok && two.ok).toBe(true);
  });

  it("erişim çerezi yokken yenileme çerezi ile önce refresh çağrılır ve çerezler yazılır", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/api/auth/refresh")) {
        return new Response(JSON.stringify(loginBody(fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }))), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const request = new Request("http://localhost:3000/api/auth/me", {
      headers: { cookie: "lgs_yenile=eski-yenile", host: "localhost:3000", "x-forwarded-for": "9.9.9.9:1234" },
    });
    const response = await handleBffRequest(request, ["auth", "me"]);
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("lgs_oturum="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("lgs_yenile=yeni-yenile"))).toBe(true);
    const upstream = fetchMock.mock.calls.at(-1);
    const headers = upstream?.[1].headers as Headers;
    expect(headers.get("authorization")).toMatch(/^Bearer /);
    expect(headers.get("x-lgs-client-ip")).toBe("9.9.9.9");
    expect(headers.get("x-lgs-proxy-key")).toBe("k".repeat(32));
  });

  it("login yanıtından token'ları çıkarır ve çerezleri yazar", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(loginBody("gizli-token")), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ userName: "a", password: "b" }),
    });
    const response = await handleBffRequest(request, ["auth", "login"]);
    const text = await response.text();
    expect(text).not.toContain("gizli-token");
    expect(text).not.toContain("yeni-yenile");
    expect(response.headers.getSetCookie().join("\n")).toContain("lgs_oturum=gizli-token");
  });

  it("başka Origin ile POST 403 alır ve backend çağrılmaz", async () => {
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { origin: "https://kotu.example", host: "localhost:3000" },
      body: "{}",
    });
    const response = await handleBffRequest(request, ["auth", "login"]);
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("geçersiz yol parçalarını reddeder", async () => {
    const request = new Request("http://localhost:3000/api/x", { headers: { host: "localhost:3000" } });
    expect((await handleBffRequest(request, ["..", "x"])).status).toBe(400);
  });

  it("yenileme başarısızsa çerezleri siler ve 401 aktarır", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ title: "Oturum yenilenemedi." }), { status: 401, headers: { "content-type": "application/problem+json" } }));
    const request = new Request("http://localhost:3000/api/questions", { headers: { cookie: "lgs_yenile=eski", host: "localhost:3000" } });
    const response = await handleBffRequest(request, ["questions"]);
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().every((c) => c.includes("Max-Age=0"))).toBe(true);
  });
});
