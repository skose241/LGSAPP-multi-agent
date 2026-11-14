export interface CookieSpec {
  name: string;
  value: string;
  maxAge: number;
  secure: boolean;
  path?: string;
}

export function serializeCookie(spec: CookieSpec): string {
  const parts = [
    `${spec.name}=${encodeURIComponent(spec.value)}`,
    `Path=${spec.path ?? "/"}`,
    `Max-Age=${Math.max(0, Math.floor(spec.maxAge))}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (spec.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name: string, secure: boolean, path = "/"): string {
  return serializeCookie({ name, value: "", maxAge: 0, secure, path });
}

export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name || name in result) continue;
    const raw = part.slice(index + 1).trim();
    try {
      result[name] = decodeURIComponent(raw);
    } catch {
      result[name] = raw;
    }
  }
  return result;
}
