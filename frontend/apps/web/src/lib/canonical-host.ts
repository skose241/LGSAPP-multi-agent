const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const EXEMPT_EXACT = new Set(["/healthz", "/csp-report", "/favicon.ico", "/manifest.webmanifest"]);
const EXEMPT_PREFIXES = ["/api/", "/bff/", "/_next/"];

export function parseCanonicalHost(value: string | undefined): string | null {
  const host = (value ?? "").trim().toLowerCase();
  return HOSTNAME.test(host) ? host : null;
}

export function canonicalHostWarning(env: Record<string, string | undefined>): string | null {
  const raw = env.CANONICAL_HOST?.trim();
  if (!raw || parseCanonicalHost(raw)) return null;
  return "CANONICAL_HOST geçersiz (yalnızca alan adı olmalı; şema, port veya yol içermemeli). Ana alan adı yönlendirmesi kapalı.";
}

export function normalizeHost(value: string | null | undefined): string {
  const first = (value ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("[")) return first;
  const index = first.indexOf(":");
  return index === -1 ? first : first.slice(0, index);
}

export function isCanonicalExempt(pathname: string): boolean {
  if (EXEMPT_EXACT.has(pathname)) return true;
  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix) || pathname === prefix.slice(0, -1))) return true;
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

export interface CanonicalInput {
  canonicalHost: string | undefined;
  method: string;
  host: string | null | undefined;
  forwardedHost: string | null | undefined;
  trustProxy: boolean;
  pathname: string;
  search: string;
}

export function canonicalRedirectUrl(input: CanonicalInput): string | null {
  const canonical = parseCanonicalHost(input.canonicalHost);
  if (!canonical) return null;
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  if (isCanonicalExempt(input.pathname)) return null;
  const current = normalizeHost(input.trustProxy && input.forwardedHost ? input.forwardedHost : input.host);
  if (!current || current === canonical) return null;
  return `https://${canonical}${input.pathname}${input.search}`;
}
