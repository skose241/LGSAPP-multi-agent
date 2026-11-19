export interface CspOptions {
  nonce: string;
  dev: boolean;
  imgHosts: string;
}

export function buildCsp({ nonce, dev, imgHosts }: CspOptions): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'"];
  if (dev) scriptSrc.push("'unsafe-eval'");
  const imgSrc = ["'self'", "blob:", "data:", ...imgHosts.split(/\s+/).filter(Boolean)];
  const connectSrc = ["'self'"];
  if (dev) connectSrc.push("ws:", "wss:");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc.join(" ")}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    `connect-src ${connectSrc.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /csp-report",
    "report-to csp",
  ].join("; ");
}

export function cspHeaderName(reportOnly: boolean): string {
  return reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

export function isReportOnly(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") return true;
  return value.trim().toLowerCase() !== "false";
}

export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

export const REPORTING_ENDPOINTS = 'csp="/csp-report"';
