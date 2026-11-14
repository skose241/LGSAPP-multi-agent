export const ACCESS_COOKIE = "lgs_oturum";
export const REFRESH_COOKIE = "lgs_yenile";
export const REFRESH_EARLY_SECONDS = 60;
export const BUFFER_LIMIT_BYTES = 1_048_576;
export const MAX_BODY_BYTES = 12 * 1_048_576;

export interface CookieNames {
  access: string;
  refresh: string;
}

export function cookieNamesFor(secure: boolean): CookieNames {
  return secure
    ? { access: `__Host-${ACCESS_COOKIE}`, refresh: `__Host-${REFRESH_COOKIE}` }
    : { access: ACCESS_COOKIE, refresh: REFRESH_COOKIE };
}

export function apiBaseUrl(): string {
  const value = process.env.API_BASE_URL;
  if (!value) {
    throw new Error("API_BASE_URL tanımlı değil.");
  }
  return value.replace(/\/+$/, "");
}

export function proxyKey(): string | undefined {
  const value = process.env.BFF_PROXY_KEY;
  return value ? value : undefined;
}

export function cookieSecure(): boolean {
  if (process.env.SESSION_COOKIE_SECURE === "false") return false;
  if (process.env.SESSION_COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

export function cookieNames(): CookieNames {
  return cookieNamesFor(cookieSecure());
}

export function trustProxy(): boolean {
  return process.env.TRUST_PROXY === "true";
}

export function trustedProxyHops(): number {
  const parsed = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export function appOrigins(): string[] {
  return (process.env.APP_ORIGIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      try {
        return [new URL(value).origin];
      } catch {
        return [];
      }
    });
}
