import { cookieNamesFor } from "./config";
import { clearCookie, serializeCookie } from "./cookies";

export interface TokenBody {
  token?: unknown;
  expiresAtUtc?: unknown;
  refreshToken?: unknown;
  refreshExpiresAtUtc?: unknown;
  [key: string]: unknown;
}

function secondsUntil(value: unknown, now: Date): number {
  if (typeof value !== "string") return 0;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((time - now.getTime()) / 1000));
}

export function clearSessionCookies(secure: boolean): string[] {
  const names = cookieNamesFor(secure);
  return [clearCookie(names.access, secure), clearCookie(names.refresh, secure)];
}

export function sessionCookiesFromBody(body: TokenBody, secure: boolean, now: Date = new Date()): string[] {
  const cookies: string[] = [];
  const names = cookieNamesFor(secure);
  if (typeof body.token === "string" && body.token) {
    cookies.push(
      serializeCookie({
        name: names.access,
        value: body.token,
        maxAge: secondsUntil(body.expiresAtUtc, now),
        secure,
      }),
    );
  } else {
    cookies.push(clearCookie(names.access, secure));
  }

  if (typeof body.refreshToken === "string" && body.refreshToken) {
    cookies.push(
      serializeCookie({
        name: names.refresh,
        value: body.refreshToken,
        maxAge: secondsUntil(body.refreshExpiresAtUtc, now),
        secure,
      }),
    );
  } else {
    cookies.push(clearCookie(names.refresh, secure));
  }
  return cookies;
}

export function stripTokens(body: TokenBody): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...body };
  delete rest.token;
  delete rest.refreshToken;
  return rest;
}
