import { describe, expect, it } from "vitest";
import { brokenPdf, buildPdf, PAGE_HEIGHT, PAGE_WIDTH } from "../../../e2e/support/pdf-fixture";
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from "@/lib/page-split/model";
import { SourceError } from "@/lib/page-split/sources";
import { documentOptions, mapPdfError, pdfAssetBase, type PdfjsModule } from "./pdfjs";
import { openPdfDocument, validatePdfFile } from "./pdf-source";

async function lib(): Promise<PdfjsModule> {
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
}

describe("pdf hata eşlemesi", () => {
  it("pdf.js hata adlarını kullanıcı kodlarına çevirir", () => {
    expect(mapPdfError({ name: "PasswordException" }).code).toBe("password");
    expect(mapPdfError({ name: "InvalidPDFException" }).code).toBe("invalid");
    expect(mapPdfError({ name: "MissingPDFException" }).code).toBe("invalid");
    expect(mapPdfError({ name: "RenderingCancelledException" }).code).toBe("aborted");
    expect(mapPdfError(new Error("bilinmeyen")).code).toBe("invalid");
    const own = new SourceError("tooLarge", "x");
    expect(mapPdfError(own)).toBe(own);
  });

  it("belge seçenekleri eval'i kapatır ve varlıkları sürümlü yoldan alır", () => {
    const options = documentOptions("9.9.9", new Uint8Array(1));
    expect(options.isEvalSupported).toBe(false);
    expect(options.enableXfa).toBe(false);
    expect(options.cMapUrl).toBe("/pdfjs/9.9.9/cmaps/");
    expect(options.standardFontDataUrl).toBe("/pdfjs/9.9.9/standard_fonts/");
    expect(options.wasmUrl).toBe("/pdfjs/9.9.9/wasm/");
    expect(pdfAssetBase("1.0.0")).toBe("/pdfjs/1.0.0/");
  });

  it("dosya boyutu sınırlarını denetler", () => {
    expect(() => validatePdfFile({ size: 0 })).toThrowError(SourceError);
    expect(() => validatePdfFile({ size: MAX_PDF_BYTES + 1 })).toThrowError(SourceError);
    expect(() => validatePdfFile({ size: MAX_PDF_BYTES })).not.toThrow();
  });
});

describe("pdf.js ile örnek PDF", () => {
  it("sayfa sayısını, boyutu ve parmak izini okur", async () => {
    const opened = await openPdfDocument(await lib(), new Uint8Array(buildPdf({ pages: 3 })));
    try {
      expect(opened.document.numPages).toBe(3);
      expect(opened.sizes).toHaveLength(3);
      expect(opened.sizes[0]).toEqual({ width: PAGE_WIDTH, height: PAGE_HEIGHT });
      expect(opened.fingerprint.length).toBeGreaterThan(0);
    } finally {
      await opened.document.loadingTask.destroy();
    }
  }, 30_000);

  it("aynı içerik aynı parmak izini, farklı içerik farklısını verir", async () => {
    const pdfjs = await lib();
    const a = await openPdfDocument(pdfjs, new Uint8Array(buildPdf({ pages: 2 })));
    const b = await openPdfDocument(pdfjs, new Uint8Array(buildPdf({ pages: 2 })));
    const c = await openPdfDocument(pdfjs, new Uint8Array(buildPdf({ pages: 4 })));
    try {
      expect(a.fingerprint).toBe(b.fingerprint);
      expect(a.fingerprint).not.toBe(c.fingerprint);
    } finally {
      await Promise.all([a.document.loadingTask.destroy(), b.document.loadingTask.destroy(), c.document.loadingTask.destroy()]);
    }
  }, 30_000);

  it("60 sayfadan uzun PDF'i reddeder", async () => {
    await expect(openPdfDocument(await lib(), new Uint8Array(buildPdf({ pages: MAX_PDF_PAGES + 1, questionsPerPage: 1 })))).rejects.toMatchObject({ code: "tooManyPages" });
  }, 60_000);

  it("bozuk PDF için geçersiz hatası verir", async () => {
    await expect(openPdfDocument(await lib(), new Uint8Array(brokenPdf()))).rejects.toMatchObject({ code: "invalid" });
  }, 30_000);
});
