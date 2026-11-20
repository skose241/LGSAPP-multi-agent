import {
  BUFFER_LIMIT_BYTES,
  MAX_BODY_BYTES,
  REFRESH_EARLY_SECONDS,
  appOrigins,
  cookieNames,
  cookieSecure,
  trustProxy,
  trustedProxyHops,
} from "./config";
import { resolveClientIp } from "./client-ip";
import { parseCookieHeader } from "./cookies";
import { isRequestTrusted } from "./csrf";
import { refreshSession, type RefreshResult } from "./refresh";
import { clearSessionCookies, sessionCookiesFromBody, stripTokens, type TokenBody } from "./session";
import { callUpstream } from "./upstream";
import { decodeJwt, secondsUntilExpiry } from "../jwt";

const PASSTHROUGH_RESPONSE_HEADERS = ["content-type", "retry-after", "content-disposition", "etag"];
const ANONYMOUS_PATHS = new Set(["auth/login", "auth/refresh", "auth/logout", "auth/forgot-password", "auth/recover"]);
const TOKEN_RESPONSE_PATHS = new Set(["auth/login", "auth/change-password"]);
const POST_ONLY_PATHS = new Set(["auth/refresh", "auth/logout", "auth/logout-all"]);
const SERVER_ERROR_TITLE = "Sunucuda beklenmeyen bir hata oluştu.";

function problem(status: number, title: string, cookies: string[] = [], extra?: Record<string, string>): Response {
  const headers = new Headers({ "content-type": "application/problem+json", "cache-control": "no-store", ...extra });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify({ title, status }), { status, headers });
}

function jsonResponse(body: unknown, status: number, cookies: string[]): Response {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export function safeLocation(value: string | null, host: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return host && url.host.toLowerCase() === host.toLowerCase() ? value : null;
  } catch {
    return null;
  }
}

function relay(upstream: Response, cookies: string[], host: string | null, extra?: Record<string, string>): Response {
  const headers = new Headers({ "cache-control": "no-store", ...extra });
  const upstreamType = upstream.headers.get("content-type") ?? "";

  if (upstream.status >= 500 && !upstreamType.toLowerCase().includes("application/problem+json")) {
    headers.set("content-type", "application/problem+json");
    for (const cookie of cookies) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify({ title: SERVER_ERROR_TITLE, status: upstream.status }), {
      status: upstream.status,
      headers,
    });
  }

  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const location = safeLocation(upstream.headers.get("location"), host);
  if (location) headers.set("location", location);
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  const hasBody = ![101, 204, 205, 304].includes(upstream.status);
  return new Response(hasBody ? upstream.body : null, { status: upstream.status, headers });
}

function relayFailure(result: Extract<RefreshResult, { ok: false }>): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (result.contentType) headers.set("content-type", result.contentType);
  if (result.retryAfter) headers.set("retry-after", result.retryAfter);
  for (const cookie of result.setCookies) headers.append("set-cookie", cookie);
  return new Response(result.bodyText || null, { status: result.status, headers });
}

function validSegments(segments: string[]): boolean {
  return (
    segments.length > 0 &&
    segments.every((s) => s !== "" && s !== "." && s !== ".." && !s.includes("/") && !s.includes("\\"))
  );
}

export async function handleBffRequest(request: Request, segments: string[]): Promise<Response> {
  if (!validSegments(segments)) return problem(400, "Geçersiz istek yolu.");

  const method = request.method.toUpperCase();
  const path = segments.join("/").toLowerCase();
  const host = request.headers.get("host");

  if (POST_ONLY_PATHS.has(path) && method !== "POST") {
    return problem(405, "Bu uç yalnızca POST kabul eder.", [], { allow: "POST" });
  }

  const trusted = isRequestTrusted({
    method,
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    host,
    allowedOrigins: appOrigins(),
  });
  if (!trusted) return problem(403, "İstek kaynağı doğrulanamadı.");

  const declaredLength = Number(request.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return problem(413, "İstek gövdesi çok büyük. En fazla 12 MB gönderilebilir.");
  }

  const secure = cookieSecure();
  const names = cookieNames();
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const clientIp = resolveClientIp(request.headers.get("x-forwarded-for"), {
    trustProxy: trustProxy(),
    hops: trustedProxyHops(),
  });
  const refreshCookie = cookies[names.refresh];
  let accessToken = cookies[names.access];
  const upstreamPath = `api/${segments.map(encodeURIComponent).join("/")}`;
  const query = new URL(request.url).search;

  try {
    if (path === "auth/refresh") {
      if (!refreshCookie) return problem(401, "Oturum yenilenemedi.", clearSessionCookies(secure));
      const result = await refreshSession(refreshCookie, clientIp);
      return result.ok ? jsonResponse(result.body, 200, result.setCookies) : relayFailure(result);
    }

    if (path === "auth/logout") {
      if (refreshCookie) {
        await callUpstream({
          method: "POST",
          path: upstreamPath,
          clientIp,
          accessToken,
          headers: new Headers({ "content-type": "application/json" }),
          body: JSON.stringify({ refreshToken: refreshCookie }),
        }).catch(() => null);
      }
      const headers = new Headers({ "cache-control": "no-store" });
      for (const cookie of clearSessionCookies(secure)) headers.append("set-cookie", cookie);
      return new Response(null, { status: 204, headers });
    }

    const anonymous = ANONYMOUS_PATHS.has(path);
    const setCookies: string[] = [];
    let refreshed = false;

    if (!anonymous && refreshCookie) {
      const remaining = secondsUntilExpiry(decodeJwt(accessToken));
      if (!accessToken || remaining <= REFRESH_EARLY_SECONDS) {
        const result = await refreshSession(refreshCookie, clientIp);
        if (result.ok) {
          accessToken = result.accessToken;
          setCookies.push(...result.setCookies);
          refreshed = true;
        } else if (!accessToken || remaining <= 0 || result.setCookies.length > 0) {
          return relayFailure(result);
        }
      }
    }

    const hasBody = request.body !== null && method !== "GET" && method !== "HEAD";
    const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
    const bufferable =
      hasBody &&
      !contentType.startsWith("multipart/") &&
      Number.isFinite(declaredLength) &&
      declaredLength < BUFFER_LIMIT_BYTES;
    const payload: BodyInit | null = !hasBody ? null : bufferable ? await request.arrayBuffer() : request.body;
    const replayable = !hasBody || bufferable;

    const send = () =>
      callUpstream({
        method,
        path: upstreamPath,
        query,
        clientIp,
        accessToken: anonymous ? null : accessToken,
        headers: request.headers,
        body: payload,
      });

    let upstream = await send();

    if (upstream.status === 401 && !anonymous && refreshCookie && !refreshed) {
      const result = await refreshSession(refreshCookie, clientIp);
      if (!result.ok) return relayFailure(result);
      setCookies.push(...result.setCookies);
      if (!replayable) {
        return problem(401, "Oturum yenilendi. İşlemi tekrar deneyin.", setCookies, { "x-session-refreshed": "1" });
      }
      accessToken = result.accessToken;
      upstream = await send();
    }

    if (upstream.status === 401 && !anonymous && !refreshCookie) {
      return relay(upstream, clearSessionCookies(secure), host);
    }

    if (TOKEN_RESPONSE_PATHS.has(path) && upstream.ok) {
      const body = (await upstream.json()) as TokenBody;
      return jsonResponse(stripTokens(body), upstream.status, sessionCookiesFromBody(body, secure));
    }

    if (path === "auth/logout-all" && (upstream.ok || upstream.status === 401)) {
      return relay(upstream, clearSessionCookies(secure), host);
    }

    return relay(upstream, setCookies, host);
  } catch {
    return problem(503, "Sunucuya ulaşılamadı.", [], { "retry-after": "5" });
  }
}
