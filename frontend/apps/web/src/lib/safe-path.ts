function hasForbidden(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 32 || code === 127 || char === String.fromCharCode(92)) return true;
  }
  return false;
}
const PROBE = "http://x";

export function safeNextPath(value: string | null | undefined): string {
  if (!value || hasForbidden(value)) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, PROBE);
  } catch {
    return "/";
  }

  if (url.origin !== PROBE || url.pathname.startsWith("//")) return "/";
  if (url.pathname.startsWith("/giris") || url.pathname.startsWith("/api")) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
