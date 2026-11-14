const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfInput {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
  allowedOrigins?: string[];
}

export function isRequestTrusted({ method, origin, secFetchSite, host, allowedOrigins = [] }: CsrfInput): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;

  if (secFetchSite === "cross-site" || secFetchSite === "same-site") return false;

  if (origin) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      return false;
    }
    if (allowedOrigins.length > 0) return allowedOrigins.includes(parsed.origin);
    if (!host) return false;
    return parsed.host.toLowerCase() === host.toLowerCase();
  }

  return secFetchSite === "same-origin";
}
