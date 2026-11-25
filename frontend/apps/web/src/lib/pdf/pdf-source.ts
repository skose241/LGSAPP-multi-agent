import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { JPEG_CROP_QUALITY, JPEG_PREVIEW_QUALITY, canvasToJpeg, createCanvas, releaseCanvas } from "@/lib/page-split/canvas";
import { planCrop } from "@/lib/page-split/crop-plan";
import type { Rect } from "@/lib/page-split/geometry";
import { pdfSourceKey } from "@/lib/page-split/draft-store";
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from "@/lib/page-split/model";
import { SourceError, throwIfAborted, type PageSize, type PageSource } from "@/lib/page-split/sources";
import { documentOptions, mapPdfError, type PdfjsModule } from "./pdfjs";
import { extractPageText } from "./text-content";

export interface OpenedPdf {
  document: PDFDocumentProxy;
  sizes: PageSize[];
  fingerprint: string;
}

export function validatePdfFile(file: { size: number }): void {
  if (file.size === 0) throw new SourceError("empty", "Seçtiğiniz PDF boş.");
  if (file.size > MAX_PDF_BYTES) throw new SourceError("tooLarge", "PDF en fazla 50 MB olabilir. Daha küçük bir dosya seçin.");
}

export async function openPdfDocument(lib: PdfjsModule, data: Uint8Array): Promise<OpenedPdf> {
  const byteLength = data.byteLength;
  let document: PDFDocumentProxy;
  try {
    document = await lib.getDocument(documentOptions(lib.version, data)).promise;
  } catch (error) {
    throw mapPdfError(error);
  }
  try {
    if (document.numPages > MAX_PDF_PAGES) {
      throw new SourceError("tooManyPages", `PDF en fazla ${MAX_PDF_PAGES} sayfa olabilir. Bu dosyada ${document.numPages} sayfa var; bölümlere ayırıp tekrar deneyin.`);
    }
    const sizes: PageSize[] = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      sizes.push({ width: viewport.width, height: viewport.height });
      page.cleanup();
    }
    return { document, sizes, fingerprint: document.fingerprints[0] ?? `${byteLength}` };
  } catch (error) {
    void document.loadingTask.destroy();
    throw mapPdfError(error);
  }
}

export async function openPdfSource(lib: PdfjsModule, file: Blob): Promise<PageSource> {
  validatePdfFile(file);
  const data = new Uint8Array(await file.arrayBuffer());
  const opened = await openPdfDocument(lib, data);
  return createPdfSource(opened);
}

export function createPdfSource({ document, sizes, fingerprint }: OpenedPdf): PageSource {
  const tasks = new Set<RenderTask>();

  async function run(pageNumber: number, scale: number, width: number, height: number, quality: number, offset: { x: number; y: number }, signal?: AbortSignal): Promise<Blob> {
    throwIfAborted(signal);
    const { canvas, context } = createCanvas(width, height);
    let task: RenderTask | null = null;
    const onAbort = () => task?.cancel();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const page = await document.getPage(pageNumber);
      throwIfAborted(signal);
      const viewport = page.getViewport({ scale });
      task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        background: "#ffffff",
        transform: [1, 0, 0, 1, -offset.x, -offset.y],
      });
      tasks.add(task);
      await task.promise;
      const blob = await canvasToJpeg(canvas, quality);
      page.cleanup();
      return blob;
    } catch (error) {
      throw mapPdfError(error);
    } finally {
      signal?.removeEventListener("abort", onAbort);
      if (task) tasks.delete(task);
      releaseCanvas(canvas);
    }
  }

  return {
    kind: "pdf",
    key: pdfSourceKey(fingerprint),
    pageCount: sizes.length,
    pageSize: (page) => sizes[page] ?? { width: 1, height: 1 },
    async renderPreview(page, maxEdge, _rotation, signal) {
      const size = sizes[page];
      if (!size) throw new SourceError("render", "Sayfa bulunamadı.");
      const scale = maxEdge / Math.max(size.width, size.height);
      return run(page + 1, scale, size.width * scale, size.height * scale, JPEG_PREVIEW_QUALITY, { x: 0, y: 0 }, signal);
    },
    async renderCrop(page, rect: Rect, _rotation, signal) {
      const size = sizes[page];
      if (!size) throw new SourceError("render", "Sayfa bulunamadı.");
      const plan = planCrop(rect.width * size.width, rect.height * size.height);
      if (!plan.ok) throw new SourceError(plan.reason, plan.message);
      return run(page + 1, plan.scale, plan.width, plan.height, JPEG_CROP_QUALITY, { x: rect.x * size.width * plan.scale, y: rect.y * size.height * plan.scale }, signal);
    },
    async textContent(page, signal) {
      throwIfAborted(signal);
      if (page < 0 || page >= sizes.length) throw new SourceError("render", "Sayfa bulunamadı.");
      try {
        const proxy = await document.getPage(page + 1);
        try {
          return await extractPageText(proxy);
        } finally {
          proxy.cleanup();
        }
      } catch (error) {
        throw mapPdfError(error);
      }
    },
    dispose() {
      for (const task of tasks) task.cancel();
      tasks.clear();
      void document.loadingTask.destroy();
    },
  };
}
