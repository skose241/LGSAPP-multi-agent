import { cookieSecure } from "./config";
import { clearSessionCookies, sessionCookiesFromBody, stripTokens, type TokenBody } from "./session";
import { callUpstream } from "./upstream";

export type RefreshResult =
  | { ok: true; accessToken: string; setCookies: string[]; body: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      setCookies: string[];
      contentType: string | null;
      retryAfter: string | null;
      bodyText: string;
    };

const inflight = new Map<string, Promise<RefreshResult>>();

async function performRefresh(refreshToken: string, clientIp: string | null): Promise<RefreshResult> {
  const secure = cookieSecure();
  let response: Response;
  try {
    response = await callUpstream({
      method: "POST",
      path: "api/auth/refresh",
      clientIp,
      headers: new Headers({ "content-type": "application/json", accept: "application/json" }),
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return {
      ok: false,
      status: 503,
      setCookies: [],
      contentType: "application/problem+json",
      retryAfter: null,
      bodyText: JSON.stringify({ title: "Sunucuya ulaşılamadı.", status: 503 }),
    };
  }

  if (response.ok) {
    const body = (await response.json()) as TokenBody;
    const token = typeof body.token === "string" ? body.token : "";
    if (token) {
      return {
        ok: true,
        accessToken: token,
        setCookies: sessionCookiesFromBody(body, secure),
        body: stripTokens(body),
      };
    }
  }

  const rejected = response.status === 400 || response.status === 401 || response.ok;
  return {
    ok: false,
    status: response.ok ? 401 : response.status,
    setCookies: rejected ? clearSessionCookies(secure) : [],
    contentType: response.headers.get("content-type"),
    retryAfter: response.headers.get("retry-after"),
    bodyText: response.ok ? "" : await response.text(),
  };
}

export function refreshSession(refreshToken: string, clientIp: string | null): Promise<RefreshResult> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing;
  const promise = performRefresh(refreshToken, clientIp).finally(() => {
    inflight.delete(refreshToken);
  });
  inflight.set(refreshToken, promise);
  return promise;
}
