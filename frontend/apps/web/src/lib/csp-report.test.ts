import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/csp-report/route";
import { allowReport, parseCspReports, resetReportLimiter, stripUrl } from "./csp-report";

function post(body: string, type = "application/csp-report", ip = "1.1.1.1") {
  return new Request("http://localhost/csp-report", {
    method: "POST",
    headers: { "content-type": type, "x-forwarded-for": ip },
    body,
  });
}

describe("parseCspReports", () => {
  it("report-uri biçimini ayrıştırır ve sorgu dizesini atar", () => {
    const lines = parseCspReports(
      JSON.stringify({
        "csp-report": {
          "document-uri": "https://x.test/giris?token=gizli#a",
          "violated-directive": "img-src",
          "effective-directive": "img-src",
          "blocked-uri": "https://cdn.test/a.png?sig=gizli#f",
          disposition: "report",
          "source-file": "https://x.test/_next/a.js?v=1",
          "line-number": 12,
        },
      }),
    );
    expect(lines).toEqual([
      {
        directive: "img-src",
        blocked: "https://cdn.test/a.png",
        document: "/giris",
        disposition: "report",
        sourceFile: "https://x.test/_next/a.js",
        line: 12,
      },
    ]);
  });

  it("Reporting API dizisini ayrıştırır", () => {
    const lines = parseCspReports(
      JSON.stringify([
        { type: "csp-violation", body: { effectiveDirective: "script-src", blockedURL: "inline", documentURL: "https://x.test/a/b?q=1", disposition: "enforce", lineNumber: 3 } },
        { type: "deprecation", body: {} },
      ]),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ directive: "script-src", blocked: "inline", document: "/a/b", disposition: "enforce", line: 3 });
  });

  it("bozuk JSON boş döner", () => {
    expect(parseCspReports("{bozuk")).toEqual([]);
    expect(parseCspReports("123")).toEqual([]);
  });

  it("stripUrl sorgu ve fragment atar", () => {
    expect(stripUrl("https://a.test/p?x=1#y")).toBe("https://a.test/p");
    expect(stripUrl("eval")).toBe("eval");
  });
});

describe("POST /csp-report", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetReportLimiter();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("geçerli raporu loglar ve 204 döner", async () => {
    const res = await POST(post(JSON.stringify({ "csp-report": { "violated-directive": "img-src", "blocked-uri": "https://c.test/a?z=1" } })));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe("[csp]");
    expect(String(warn.mock.calls[0][1])).not.toContain("z=1");
  });

  it("reports+json kabul edilir", async () => {
    const res = await POST(post(JSON.stringify([{ type: "csp-violation", body: { effectiveDirective: "style-src" } }]), "application/reports+json"));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("bozuk JSON 204 ve log yok", async () => {
    const res = await POST(post("{bozuk"));
    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it("boyut sınırı aşılırsa 413", async () => {
    const res = await POST(post("x".repeat(17 * 1024)));
    expect(res.status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });

  it("hız sınırı aşılınca sessizce 204", async () => {
    const body = JSON.stringify({ "csp-report": { "violated-directive": "img-src" } });
    for (let i = 0; i < 40; i++) {
      const res = await POST(post(body, "application/csp-report", "9.9.9.9"));
      expect(res.status).toBe(204);
    }
    expect(warn).toHaveBeenCalledTimes(30);
  });
});

describe("allowReport", () => {
  it("pencere sonunda sıfırlanır", () => {
    resetReportLimiter();
    expect(allowReport("a", 0, 1)).toBe(true);
    expect(allowReport("a", 1000, 1)).toBe(false);
    expect(allowReport("a", 61_000, 1)).toBe(true);
  });
});
