import { describe, expect, it } from "vitest";
import { REPORTING_ENDPOINTS, buildCsp, cspHeaderName, isReportOnly } from "./csp";

describe("buildCsp", () => {
  it("üretimde unsafe-eval ve websocket içermez", () => {
    const csp = buildCsp({ nonce: "abc", dev: false, imgHosts: "https://blob.example.net" });
    expect(csp).toContain("'nonce-abc'");
    expect(csp).toContain("img-src 'self' blob: data: https://blob.example.net");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("ws:");
  });

  it("rapor direktiflerini içerir", () => {
    const csp = buildCsp({ nonce: "abc", dev: false, imgHosts: "" });
    expect(csp).toContain("report-uri /csp-report");
    expect(csp).toContain("report-to csp");
    expect(REPORTING_ENDPOINTS).toBe('csp="/csp-report"');
  });

  it("geliştirmede unsafe-eval ve websocket ekler", () => {
    const csp = buildCsp({ nonce: "abc", dev: true, imgHosts: "" });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
  });
});

describe("rapor modu", () => {
  it("varsayılan report-only, yalnız false zorlayıcı", () => {
    expect(isReportOnly(undefined)).toBe(true);
    expect(isReportOnly("true")).toBe(true);
    expect(isReportOnly("false")).toBe(false);
    expect(cspHeaderName(true)).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName(false)).toBe("Content-Security-Policy");
  });
});
