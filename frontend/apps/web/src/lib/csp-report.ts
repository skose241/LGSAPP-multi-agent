import { resolveClientIp } from "@/lib/bff/client-ip";
import { trustProxy, trustedProxyHops } from "@/lib/bff/config";

export const MAX_REPORT_BYTES = 16 * 1024;
export const RATE_LIMIT_PER_MINUTE = 30;
export const GLOBAL_RATE_LIMIT_PER_MINUTE = 300;
const MAX_FIELD = 200;
const MAX_LOGGED_PER_REQUEST = 3;
const MAX_TRACKED_IPS = 5000;

export interface CspReportLine {
  directive: string;
  blocked: string;
  document: string;
  disposition: string;
  sourceFile: string;
  line: number | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_FIELD) : "";
}

export function stripUrl(value: unknown): string {
  const raw = text(value);
  if (raw === "") return "";
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return `${url.origin}${url.pathname}`;
    return `${url.protocol}`;
  } catch {
    return raw.replace(/[?#].*$/, "");
  }
}

export function documentPath(value: unknown): string {
  const raw = text(value);
  if (raw === "") return "";
  try {
    return new URL(raw).pathname;
  } catch {
    return raw.replace(/[?#].*$/, "");
  }
}

function pick(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function toLine(body: unknown): CspReportLine | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const source = body as Record<string, unknown>;
  const lineValue = pick(source, "lineNumber", "line-number");
  return {
    directive: text(pick(source, "effectiveDirective", "effective-directive", "violated-directive", "violatedDirective")),
    blocked: stripUrl(pick(source, "blockedURL", "blocked-uri", "blockedURI")),
    document: documentPath(pick(source, "documentURL", "document-uri", "documentURI")),
    disposition: text(pick(source, "disposition")),
    sourceFile: stripUrl(pick(source, "sourceFile", "source-file")),
    line: typeof lineValue === "number" && Number.isFinite(lineValue) ? lineValue : null,
  };
}

export function parseCspReports(raw: string): CspReportLine[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const lines: CspReportLine[] = [];
  if (Array.isArray(data)) {
    for (const entry of data.slice(0, MAX_LOGGED_PER_REQUEST)) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as Record<string, unknown>;
      if (item.type !== undefined && item.type !== "csp-violation") continue;
      const line = toLine(item.body);
      if (line) lines.push(line);
    }
  } else if (typeof data === "object" && data !== null) {
    const line = toLine((data as Record<string, unknown>)["csp-report"]);
    if (line) lines.push(line);
  }
  return lines;
}

export async function readLimited(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

const hits = new Map<string, { windowStart: number; count: number }>();
const globalWindow = { windowStart: 0, count: 0 };

export function allowReport(
  ip: string,
  now: number = Date.now(),
  limit: number = RATE_LIMIT_PER_MINUTE,
  globalLimit: number = GLOBAL_RATE_LIMIT_PER_MINUTE,
): boolean {
  if (now - globalWindow.windowStart >= 60_000) {
    globalWindow.windowStart = now;
    globalWindow.count = 0;
  }
  if (globalWindow.count >= globalLimit) return false;

  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart >= 60_000) {
    if (!entry && hits.size >= MAX_TRACKED_IPS) {
      for (const [key, value] of hits) {
        if (now - value.windowStart >= 60_000) hits.delete(key);
      }
      while (hits.size >= MAX_TRACKED_IPS) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
      }
    }
    hits.delete(ip);
    hits.set(ip, { windowStart: now, count: 1 });
    globalWindow.count += 1;
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  globalWindow.count += 1;
  return true;
}

export function resetReportLimiter(): void {
  hits.clear();
  globalWindow.windowStart = 0;
  globalWindow.count = 0;
}

export function trackedIpCount(): number {
  return hits.size;
}

export function clientIp(headers: Headers): string {
  return (
    resolveClientIp(headers.get("x-forwarded-for"), { trustProxy: trustProxy(), hops: trustedProxyHops() }) ??
    "unknown"
  );
}
