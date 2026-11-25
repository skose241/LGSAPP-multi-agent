import { describe, expect, it } from "vitest";
import { detectAnswerKeyPage, detectAnswerKeys, mergeKeyPages } from "./answer-key-detect";
import { column, frag } from "./text-test-utils";

function rows(lines: string[], top = 0.12, step = 0.03) {
  return lines.map((text, index) => frag(0.1, top + index * step, text));
}

describe("cevap anahtarı sayfası", () => {
  it("başlık ve numara-şık satırlarını okur", () => {
    const page = detectAnswerKeyPage(2, [frag(0.3, 0.05, "CEVAP ANAHTARI"), ...rows(["1. A", "2. C", "3. B", "4. D"])]);
    expect(page.isKey).toBe(true);
    expect(page.fromY).toBeCloseTo(0.05, 3);
    expect([...page.answers]).toEqual([[1, "A"], [2, "C"], [3, "B"], [4, "D"]]);
  });

  it("tire, parantez ve bitişik biçimleri kabul eder", () => {
    const page = detectAnswerKeyPage(0, [frag(0.3, 0.05, "Cevap Anahtarı"), ...rows(["1-A", "2) c", "3.B", "4 – D"])]);
    expect([...page.answers]).toEqual([[1, "A"], [2, "C"], [3, "B"], [4, "D"]]);
  });

  it("başlık yazımındaki farkları tanır", () => {
    expect(detectAnswerKeyPage(0, [frag(0.3, 0.05, "CEVAP ANAHTARI"), frag(0.1, 0.1, "1. A")]).isKey).toBe(true);
    expect(detectAnswerKeyPage(0, [frag(0.3, 0.05, "CEVAP  ANAHTARI"), frag(0.1, 0.1, "1. A")]).isKey).toBe(true);
    expect(detectAnswerKeyPage(0, [frag(0.3, 0.05, "Doğru Cevaplar"), frag(0.1, 0.1, "1. A")]).isKey).toBe(true);
  });

  it("aynı satırdaki birden çok cevabı okur", () => {
    const page = detectAnswerKeyPage(0, [frag(0.3, 0.05, "CEVAP ANAHTARI"), frag(0.1, 0.1, "1. A  2. C  3. B  4. D")]);
    expect(page.answers.size).toBe(4);
    expect(page.answers.get(3)).toBe("B");
  });

  it("hücreli tablo satırlarını okur", () => {
    const cells = [frag(0.1, 0.1, "1"), frag(0.2, 0.1, "A"), frag(0.4, 0.1, "2"), frag(0.5, 0.1, "C"), frag(0.1, 0.13, "3"), frag(0.2, 0.13, "D"), frag(0.4, 0.13, "4"), frag(0.5, 0.13, "B")];
    const page = detectAnswerKeyPage(0, [frag(0.3, 0.05, "CEVAP ANAHTARI"), ...cells]);
    expect([...page.answers].sort((a, b) => a[0] - b[0])).toEqual([[1, "A"], [2, "C"], [3, "D"], [4, "B"]]);
  });

  it("numara satırı ve harf satırından oluşan tabloyu eşler", () => {
    const page = detectAnswerKeyPage(0, [frag(0.3, 0.05, "CEVAP ANAHTARI"), frag(0.1, 0.1, "1 2 3 4 5"), frag(0.1, 0.13, "A C B D A")]);
    expect([...page.answers]).toEqual([[1, "A"], [2, "C"], [3, "B"], [4, "D"], [5, "A"]]);
  });

  it("başlıksız ama yoğun cevap sayfasını anahtar sayar", () => {
    const lines = Array.from({ length: 12 }, (_, index) => `${index + 1}. ${"ABCD"[index % 4]}`);
    const page = detectAnswerKeyPage(0, rows(lines));
    expect(page.isKey).toBe(true);
    expect(page.fromY).toBe(0);
    expect(page.answers.size).toBe(12);
  });

  it("soru sayfasını anahtar saymaz", () => {
    const page = detectAnswerKeyPage(0, column(0.08, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.05, 0.09));
    expect(page.isKey).toBe(false);
    expect(page.answers.size).toBe(0);
  });

  it("birkaç satırlık başlıksız metni anahtar saymaz", () => {
    expect(detectAnswerKeyPage(0, rows(["1. A", "2. B", "Bu sayfa ders notudur.", "Başka bir satır.", "Üçüncü satır."])).isKey).toBe(false);
  });

  it("sayfa ortasındaki başlıktan sonrasını okur ve başlangıç konumunu verir", () => {
    const page = detectAnswerKeyPage(0, [...column(0.08, [1, 2], 0.05, 0.2), frag(0.1, 0.7, "CEVAP ANAHTARI"), frag(0.1, 0.75, "1. D"), frag(0.1, 0.78, "2. B")]);
    expect(page.isKey).toBe(true);
    expect(page.fromY).toBeCloseTo(0.7, 3);
    expect([...page.answers]).toEqual([[1, "D"], [2, "B"]]);
  });

  it("başlık olup cevap okunamıyorsa boş cevapla işaretler", () => {
    const page = detectAnswerKeyPage(0, [frag(0.3, 0.05, "CEVAP ANAHTARI")]);
    expect(page.isKey).toBe(true);
    expect(page.answers.size).toBe(0);
  });

  it("şık olmayan harfleri ve kelimeleri cevap saymaz", () => {
    const page = detectAnswerKeyPage(0, [frag(0.3, 0.05, "CEVAP ANAHTARI"), frag(0.1, 0.1, "1 Ali"), frag(0.1, 0.13, "2. E"), frag(0.1, 0.16, "3. B")]);
    expect([...page.answers]).toEqual([[3, "B"]]);
  });
});

describe("belge geneli", () => {
  it("birden çok anahtar sayfasını birleştirir ve çakışmaları bildirir", () => {
    const pages = [
      column(0.08, [1, 2], 0.1, 0.3),
      [frag(0.3, 0.05, "CEVAP ANAHTARI"), ...rows(["1. A", "2. B"])],
      [frag(0.3, 0.05, "CEVAP ANAHTARI"), ...rows(["2. C", "3. D"])],
    ];
    const result = detectAnswerKeys(pages);
    expect(result.keyPages).toEqual([1, 2]);
    expect(result.answers.get(1)).toBe("A");
    expect(result.answers.get(2)).toBe("B");
    expect(result.answers.get(3)).toBe("D");
    expect(result.conflicts).toEqual([2]);
  });

  it("yalnız seçilen sayfaları birleştirir", () => {
    const pages = [[frag(0.3, 0.05, "CEVAP ANAHTARI"), ...rows(["1. A"])], [frag(0.3, 0.05, "CEVAP ANAHTARI"), ...rows(["1. B"])]];
    const result = detectAnswerKeys(pages);
    const merged = mergeKeyPages(result.pages, [1]);
    expect(merged.pages).toEqual([1]);
    expect(merged.answers.get(1)).toBe("B");
    expect(merged.conflicts).toEqual([]);
  });

  it("anahtar yoksa boş döner", () => {
    const result = detectAnswerKeys([column(0.08, [1, 2, 3], 0.1, 0.3)]);
    expect(result.keyPages).toEqual([]);
    expect(result.answers.size).toBe(0);
  });
});
