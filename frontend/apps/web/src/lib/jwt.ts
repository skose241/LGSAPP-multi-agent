export const ROLE_CLAIM = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";

export type Role = "mudur" | "ogretmen" | "ogrenci" | "ai";

export interface JwtInfo {
  exp: number | null;
  roles: string[];
  mustChangePassword: boolean;
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeJwt(token: string | null | undefined): JwtInfo | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(parts[1]));
    if (typeof payload !== "object" || payload === null) return null;
    const record = payload as Record<string, unknown>;
    const rawRole = record[ROLE_CLAIM] ?? record["role"];
    const roles = Array.isArray(rawRole)
      ? rawRole.filter((item): item is string => typeof item === "string")
      : typeof rawRole === "string"
        ? [rawRole]
        : [];
    return {
      exp: typeof record["exp"] === "number" ? record["exp"] : null,
      roles,
      mustChangePassword: String(record["must_change_password"]).toLowerCase() === "true",
    };
  } catch {
    return null;
  }
}

export function secondsUntilExpiry(info: JwtInfo | null, now: Date = new Date()): number {
  if (!info || info.exp === null) return 0;
  return info.exp - Math.floor(now.getTime() / 1000);
}
