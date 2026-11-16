import { describe, expect, it } from "vitest";
import katex from "katex";
import { tokenizeMath, tokenizeMathPreview } from "./math";
import { filtersToSearch, parseFilters } from "./url-state";

describe("tokenizeMath", () => {
  it("düz metni değiştirmez", () => {
    expect(tokenizeMath("Merhaba dünya")).toEqual([{ type: "text", value: "Merhaba dünya" }]);
  });

  it("satır içi ve blok formülü ayırır", () => {
    expect(tokenizeMath("Değer $x^2$ olur, $$a+b$$ sonuç")).toEqual([
      { type: "text", value: "Değer " },
      { type: "inline", value: "x^2" },
      { type: "text", value: " olur, " },
      { type: "display", value: "a+b" },
      { type: "text", value: " sonuç" },
    ]);
  });

  it("para birimi gibi kullanımları formül saymaz", () => {
    expect(tokenizeMath("5$ ve 10$ eder")).toEqual([{ type: "text", value: "5$ ve 10$ eder" }]);
  });

  it("kaçışlı dolar işaretini düz metin yapar", () => {
    expect(tokenizeMath("Fiyat \\$5 ve $y$")).toEqual([
      { type: "text", value: "Fiyat $5 ve " },
      { type: "inline", value: "y" },
    ]);
  });

  it("kapanmayan işareti düz metin bırakır", () => {
    expect(tokenizeMath("açık $x^2")).toEqual([{ type: "text", value: "açık $x^2" }]);
  });

  it("HTML'i olduğu gibi metin tutar", () => {
    const result = tokenizeMath("<img src=x onerror=alert(1)>");
    expect(result).toEqual([{ type: "text", value: "<img src=x onerror=alert(1)>" }]);
  });
});

describe("soru filtreleri URL durumu", () => {
  it("varsayılanı çözülmeyenler yapar", () => {
    expect(parseFilters(new URLSearchParams(""))).toEqual({
      lessonId: undefined,
      topicId: undefined,
      source: undefined,
      answered: "unanswered",
      page: 1,
    });
  });

  it("geçerli değerleri okur, geçersizleri atar", () => {
    const parsed = parseFilters(new URLSearchParams("ders=3&konu=7&kaynak=ai&durum=tumu&sayfa=2"));
    expect(parsed).toMatchObject({ lessonId: 3, topicId: 7, source: "ai", answered: "all", page: 2 });
    const bad = parseFilters(new URLSearchParams("ders=abc&konu=7&kaynak=x&durum=x&sayfa=-1"));
    expect(bad).toMatchObject({ lessonId: undefined, topicId: undefined, source: undefined, answered: "unanswered", page: 1 });
  });

  it("ders olmadan konuyu yok sayar", () => {
    expect(parseFilters(new URLSearchParams("konu=7")).topicId).toBeUndefined();
  });

  it("filtreleri yeniden yazar", () => {
    const search = filtersToSearch({ lessonId: 3, topicId: 7, source: "teacher", answered: "answered", page: 2 });
    expect(search).toBe("?ders=3&konu=7&kaynak=teacher&durum=cozuldu&sayfa=2");
    expect(filtersToSearch({ answered: "unanswered", page: 1 })).toBe("");
  });
});

describe("tokenizeMathPreview", () => {
  it("normal metni değiştirmez", () => {
    expect(tokenizeMathPreview("Bir iki üç")).toEqual([{ type: "text", value: "Bir iki üç" }]);
  });

  it("display formülü satır içine indirger ve boşlukları sadeleştirir", () => {
    expect(tokenizeMathPreview("Değer $$ x^2 \n + 1 $$ olur")).toEqual([
      { type: "text", value: "Değer " },
      { type: "inline", value: "x^2 + 1" },
      { type: "text", value: " olur" },
    ]);
  });

  it("kesilme yüzünden yarım kalan formül düz metin kalır", () => {
    expect(tokenizeMathPreview("Çöz $\\frac{1}{2} + x…")).toEqual([{ type: "text", value: "Çöz $\\frac{1}{2} + x…" }]);
    expect(tokenizeMathPreview("Çöz $$x^2 + y…")).toEqual([{ type: "text", value: "Çöz $$x^2 + y…" }]);
  });

  it("kapalı formülden sonraki yarım formül yalnızca kendisi düz metin olur", () => {
    expect(tokenizeMathPreview("$a$ ve $b + …")).toEqual([
      { type: "inline", value: "a" },
      { type: "text", value: " ve $b + …" },
    ]);
  });

  it("üretilen formüller KaTeX hatası vermez", () => {
    for (const segment of tokenizeMathPreview("$$\\frac{a}{b}$$ ve $x^2$")) {
      if (segment.type === "text") continue;
      const html = katex.renderToString(segment.value, { displayMode: false, throwOnError: false, strict: "ignore" });
      expect(html).not.toContain("katex-error");
    }
  });
});
