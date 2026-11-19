import { describe, expect, it } from "vitest";
import { confirmCopy, kindLabel, parseRunFilters, runFiltersToQuery, runFiltersToSearch, runStatusTone } from "./scheduler";

describe("zamanlayıcı yardımcıları", () => {
  it("görev adlarını Türkçe verir", () => {
    expect(kindLabel("assignments")).toBe("Ödev kapatma");
    expect(kindLabel("generate")).toBe("Soru üretimi");
  });

  it("durum tonlarını eşler", () => {
    expect(runStatusTone("failed")).toBe("danger");
    expect(runStatusTone("running")).toBe("info");
    expect(runStatusTone("interrupted")).toBe("neutral");
  });

  it("onay metinleri kota ve yayın uyarısı içerir", () => {
    expect(confirmCopy("generate").description).toContain("Gemini kotası");
    expect(confirmCopy("complete").description).toContain("Gemini kotası");
    expect(confirmCopy("publish").description).toContain("yayına");
  });

  it("filtreleri URL ile gidiş dönüş yapar", () => {
    const filters = parseRunFilters(new URLSearchParams("tur=publish&durum=failed&baslangic=2026-11-01&bitis=2026-11-19&sayfa=3"));
    expect(filters).toEqual({ kind: "publish", status: "failed", from: "2026-11-01", to: "2026-11-19", page: 3 });
    expect(runFiltersToSearch(filters)).toBe("?tur=publish&durum=failed&baslangic=2026-11-01&bitis=2026-11-19&sayfa=3");
  });

  it("geçersiz değerleri varsayılana çevirir", () => {
    const filters = parseRunFilters(new URLSearchParams("tur=x&durum=y&baslangic=2026-13-40&bitis=abc&sayfa=-2"));
    expect(filters).toEqual({ kind: "all", status: "all", from: "", to: "", page: 1 });
    expect(runFiltersToSearch(filters)).toBe("");
    expect(runFiltersToQuery(filters)).toEqual({ kind: undefined, status: undefined, from: undefined, to: undefined, page: 1, pageSize: 20 });
  });
});
