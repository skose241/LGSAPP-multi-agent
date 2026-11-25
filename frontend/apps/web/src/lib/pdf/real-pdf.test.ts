import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectAnswerKeys } from "@/lib/page-split/answer-key-detect";
import { applySectionKeys } from "@/lib/page-split/model";
import { applyDetections } from "@/lib/page-split/suggest";
import { detectDocument } from "@/lib/page-split/text-detect";
import { openPdfDocument } from "./pdf-source";
import type { PdfjsModule } from "./pdfjs";
import { extractPageText, type TextFragment } from "./text-content";

const path = process.env.LGS_REAL_PDF;

const MATH = "BBDCBCADDABDACACDBBC";
const SCIENCE = "CADBACBDBCBADCADBCAB";

async function load(file: string): Promise<TextFragment[][]> {
  const lib = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
  const opened = await openPdfDocument(lib, new Uint8Array(readFileSync(file)));
  try {
    const pages: TextFragment[][] = [];
    for (let index = 1; index <= opened.document.numPages; index += 1) {
      const page = await opened.document.getPage(index);
      pages.push(await extractPageText(page));
    }
    return pages;
  } finally {
    await opened.document.loadingTask.destroy();
  }
}

describe.skipIf(!path)("gerçek LGS kitapçığı", () => {
  it("40 sorunun hepsini doğru numara ve bölümle bulur, cevap anahtarını 40/40 okur", async () => {
    const pages = await load(path as string);
    expect(pages).toHaveLength(33);
    const keys = detectAnswerKeys(pages);
    expect(keys.keyPages).toEqual([32]);
    expect(keys.sections.map((section) => section.name)).toEqual(["Matematik", "Fen"]);
    const read = (name: string) => [...(keys.sections.find((section) => section.name === name)?.answers ?? [])].sort((a, b) => a[0] - b[0]).map(([, letter]) => letter).join("");
    expect(read("Matematik")).toBe(MATH);
    expect(read("Fen")).toBe(SCIENCE);

    const results = detectDocument(pages, { answerKeyFrom: keys.pages.map((entry) => (entry.isKey ? entry.fromY : null)) });
    const found = results.flatMap((result) => result.boxes.map((box) => `${result.section ?? "-"}:${box.number}`));
    const expected = [...Array.from({ length: 20 }, (_, index) => `Matematik:${index + 1}`), ...Array.from({ length: 20 }, (_, index) => `Fen:${index + 1}`)];
    expect(found).toEqual(expected);
    for (const page of [0, 1, 30, 31, 32]) expect(results[page]?.boxes).toEqual([]);
    expect(results.filter((result) => result.boxes.length > 0).every((result) => result.confidence === "high")).toBe(true);

    const crossings: string[] = [];
    results.forEach((result) => {
      const fragments = pages[result.page] ?? [];
      for (const box of result.boxes) {
        const rect = box.rect;
        for (const fragment of fragments) {
          if (fragment.str.trim() === "") continue;
          const overlapY = Math.min(rect.y + rect.height, fragment.y + fragment.h) - Math.max(rect.y, fragment.y);
          if (overlapY <= 0) continue;
          const cuts = (edge: number) => fragment.x + 0.0005 < edge && edge < fragment.x + fragment.w - 0.0005;
          if (cuts(rect.x) || cuts(rect.x + rect.width)) crossings.push(`s${result.page + 1} soru ${box.number}: "${fragment.str}"`);
        }
      }
    });
    expect(crossings).toEqual([]);

    const suggested = applyDetections([], results).boxes;
    const applied = applySectionKeys(suggested, keys.sections);
    expect(applied.applied).toBe(40);
    expect(applied.unmatched).toEqual([]);
    const letters = (name: string) =>
      applied.boxes
        .filter((box) => box.section === name)
        .sort((a, b) => (a.detectedNumber ?? 0) - (b.detectedNumber ?? 0))
        .map((box) => box.option)
        .join("");
    expect(letters("Matematik")).toBe(MATH);
    expect(letters("Fen")).toBe(SCIENCE);
  }, 120_000);
});
