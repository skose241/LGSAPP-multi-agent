import { describe, expect, it } from "vitest";
import { brokenPdf, buildPdf, PAGE_HEIGHT, PAGE_WIDTH, questionRect, type PdfFixtureOptions } from "../../../e2e/support/pdf-fixture";
import { detectAnswerKeys } from "@/lib/page-split/answer-key-detect";
import { detectDocument } from "@/lib/page-split/text-detect";
import { openPdfDocument } from "./pdf-source";
import type { PdfjsModule } from "./pdfjs";
import { extractPageText, normalizeTextItems, type TextFragment } from "./text-content";

async function lib(): Promise<PdfjsModule> {
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
}

async function textOf(options: PdfFixtureOptions): Promise<{ pages: TextFragment[][]; sizes: { width: number; height: number }[] }> {
  const opened = await openPdfDocument(await lib(), new Uint8Array(buildPdf(options)));
  try {
    const pages: TextFragment[][] = [];
    for (let index = 1; index <= opened.document.numPages; index += 1) {
      const page = await opened.document.getPage(index);
      pages.push(await extractPageText(page));
    }
    return { pages, sizes: opened.sizes };
  } finally {
    await opened.document.loadingTask.destroy();
  }
}

const upright = { transform: [1, 0, 0, -1, 0, 800], width: 600, height: 800 };

describe("normalizeTextItems", () => {
  it("dönüşümsüz sayfada 0..1 aralığında normalize eder", () => {
    const [item] = normalizeTextItems([{ str: "Soru 1", transform: [12, 0, 0, 12, 60, 700], width: 120, height: 12 }], upright);
    expect(item?.x).toBeCloseTo(0.1, 5);
    expect(item?.w).toBeCloseTo(0.2, 5);
    expect(item?.y).toBeCloseTo((800 - 700 - 12) / 800, 5);
    expect(item?.h).toBeCloseTo(12 / 800, 5);
    expect(item?.fontSize).toBeCloseTo(12 / 800, 5);
  });

  it("90 derece döndürülmüş görünümde konumu ve boyutu yer değiştirir", () => {
    const viewport = { transform: [0, 1, 1, 0, 0, 0], width: 842, height: 595 };
    const [item] = normalizeTextItems([{ str: "Soru", transform: [12, 0, 0, 12, 100, 200], width: 50, height: 12 }], viewport);
    expect(item?.x).toBeCloseTo(200 / 842, 5);
    expect(item?.y).toBeCloseTo(100 / 595, 5);
    expect(item?.w).toBeCloseTo(12 / 842, 5);
    expect(item?.h).toBeCloseTo(50 / 595, 5);
  });

  it("180 derece döndürülmüş görünümde ters yerleşir", () => {
    const viewport = { transform: [-1, 0, 0, 1, 600, 0], width: 600, height: 800 };
    const [item] = normalizeTextItems([{ str: "Soru", transform: [12, 0, 0, 12, 100, 200], width: 50, height: 12 }], viewport);
    expect(item?.x).toBeCloseTo((600 - 100 - 50) / 600, 5);
    expect(item?.y).toBeCloseTo(200 / 800, 5);
    expect(item?.w).toBeCloseTo(50 / 600, 5);
    expect(item?.h).toBeCloseTo(12 / 800, 5);
  });

  it("270 derece döndürülmüş görünümde konumu eşler", () => {
    const viewport = { transform: [0, -1, -1, 0, 842, 595], width: 842, height: 595 };
    const [item] = normalizeTextItems([{ str: "Soru", transform: [12, 0, 0, 12, 100, 200], width: 50, height: 12 }], viewport);
    expect(item?.x).toBeCloseTo((842 - 200 - 12) / 842, 5);
    expect(item?.y).toBeCloseTo((595 - 100 - 50) / 595, 5);
    expect(item?.w).toBeCloseTo(12 / 842, 5);
    expect(item?.h).toBeCloseTo(50 / 595, 5);
  });

  it("ölçeği hesaba katar", () => {
    const viewport = { transform: [2, 0, 0, -2, 0, 1600], width: 1200, height: 1600 };
    const [item] = normalizeTextItems([{ str: "Soru", transform: [12, 0, 0, 12, 60, 700], width: 120, height: 12 }], viewport);
    expect(item?.x).toBeCloseTo(0.1, 5);
    expect(item?.w).toBeCloseTo(0.2, 5);
  });

  it("boş, işaretleme ve geçersiz öğeleri atar", () => {
    const items = [{ str: "  ", transform: [12, 0, 0, 12, 1, 1], width: 5 }, { str: "x" }, { str: "y", transform: [0, 0, 0, 0, 1, 1], width: 5 }, { str: "ok", transform: [10, 0, 0, 10, 10, 10], width: 20 }];
    expect(normalizeTextItems(items, upright).map((item) => item.str)).toEqual(["ok"]);
  });

  it("sayfa dışına taşan değerleri sınırlar", () => {
    const [item] = normalizeTextItems([{ str: "taşan", transform: [12, 0, 0, 12, 590, 790], width: 100 }], upright);
    expect((item?.x ?? 0) + (item?.w ?? 0)).toBeLessThanOrEqual(1);
    expect((item?.y ?? 0) + (item?.h ?? 0)).toBeLessThanOrEqual(1);
  });

  it("geçersiz görünüm boyutunda boş döner", () => {
    expect(normalizeTextItems([{ str: "a", transform: [1, 0, 0, 1, 0, 0], width: 1 }], { transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0 })).toEqual([]);
  });
});

describe("pdf.js ile gerçek metin katmanı", () => {
  it("iki sütunlu örnek sayfada 8 soru bulur", async () => {
    const { pages } = await textOf({ pages: 1 });
    expect(pages[0]).toHaveLength(8);
    const [result] = detectDocument(pages);
    expect(result?.confidence).toBe("high");
    expect(result?.boxes.map((box) => box.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const box of result?.boxes ?? []) {
      const expected = questionRect(box.number <= 4 ? (box.number - 1) * 2 : (box.number - 5) * 2 + 1);
      expect(Math.abs(box.rect.x - expected.x)).toBeLessThan(0.03);
      expect(Math.abs(box.rect.y - expected.y)).toBeLessThan(0.03);
      expect(box.rect.width).toBeGreaterThan(0.3);
      expect(box.rect.width).toBeLessThan(0.5);
    }
  }, 30_000);

  it("parça konumlarını sayfa boyutuna göre normalize eder", async () => {
    const { pages } = await textOf({ pages: 1 });
    const first = pages[0]?.find((fragment) => fragment.str === "Soru 1");
    expect(first).toBeDefined();
    expect(first!.x).toBeCloseTo((0.05 * PAGE_WIDTH + 12) / PAGE_WIDTH, 2);
    expect(first!.h).toBeGreaterThan(0.02);
    expect(first!.h).toBeLessThan(0.05);
    expect(PAGE_HEIGHT).toBeGreaterThan(PAGE_WIDTH);
  }, 30_000);

  it("çok sayfalı PDF'te numaralar sayfalar arası devam eder ve tekrar eden alt bilgi temizlenir", async () => {
    const { pages } = await textOf({ pages: 3, footer: "Diger Sayfaya Geciniz" });
    const results = detectDocument(pages);
    expect(results.map((result) => result.confidence)).toEqual(["high", "high", "high"]);
    expect(results[2]?.boxes.map((box) => box.number)).toEqual([17, 18, 19, 20, 21, 22, 23, 24]);
    for (const result of results) {
      const last = result.boxes[result.boxes.length - 1]!.rect;
      expect(last.y + last.height).toBeLessThanOrEqual(0.985);
    }
  }, 30_000);

  it("numara sırası bozuk PDF'i düşük güvenle işaretler", async () => {
    const { pages } = await textOf({ pages: 2, firstNumber: 1, questionsPerPage: 8 });
    const second = pages[1] ?? [];
    const results = detectDocument([pages[0] ?? [], second.filter((fragment) => fragment.str !== "Soru 11")]);
    expect(results[1]?.confidence).toBe("low");
    expect(results[1]?.issues.map((issue) => issue.code)).toContain("gap");
  }, 30_000);

  it("yalnız görsel (metinsiz) PDF'te noText verir", async () => {
    const { pages } = await textOf({ pages: 2, textless: true });
    expect(pages.every((page) => page.length === 0)).toBe(true);
    const results = detectDocument(pages);
    expect(results.map((result) => result.confidence)).toEqual(["none", "none"]);
    expect(results.every((result) => result.issues[0]?.code === "noText")).toBe(true);
  }, 30_000);

  it("cevap anahtarı sayfasını bulur ve soru tespitinden çıkarır", async () => {
    const { pages } = await textOf({ pages: 1, answerKey: "ACBDABCD" });
    expect(pages).toHaveLength(2);
    const keys = detectAnswerKeys(pages);
    expect(keys.keyPages).toEqual([1]);
    expect(keys.answers.size).toBe(8);
    expect(keys.answers.get(1)).toBe("A");
    expect(keys.answers.get(2)).toBe("C");
    expect(keys.answers.get(8)).toBe("D");
    const results = detectDocument(pages, { answerKeyFrom: keys.pages.map((entry) => (entry.isKey ? entry.fromY : null)) });
    expect(results[1]?.skipped).toBe("answerKey");
    expect(results[0]?.boxes).toHaveLength(8);
  }, 30_000);

  it("döndürülmüş sayfada parça konumları görünüm yönünde gelir", async () => {
    const { pages, sizes } = await textOf({ pages: 1, rotate: 90 });
    expect(sizes[0]).toEqual({ width: PAGE_HEIGHT, height: PAGE_WIDTH });
    const fragments = pages[0] ?? [];
    expect(fragments).toHaveLength(8);
    for (const fragment of fragments) {
      expect(fragment.x).toBeGreaterThanOrEqual(0);
      expect(fragment.x + fragment.w).toBeLessThanOrEqual(1.0001);
      expect(fragment.y + fragment.h).toBeLessThanOrEqual(1.0001);
      expect(fragment.h).toBeGreaterThan(fragment.w);
    }
  }, 30_000);

  it("ilk numara seçeneğiyle başlayan sayfayı okunan numaralarla çerçeveler", async () => {
    const { pages } = await textOf({ pages: 1, firstNumber: 9 });
    const [result] = detectDocument(pages);
    expect(result?.boxes.map((box) => box.number)).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(result?.confidence).toBe("high");
  }, 30_000);

  it("bozuk PDF açılamaz", async () => {
    await expect(openPdfDocument(await lib(), new Uint8Array(brokenPdf()))).rejects.toMatchObject({ code: "invalid" });
  }, 30_000);
});
