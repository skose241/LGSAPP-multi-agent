import { decode, type Decoded, type ImageDeps } from "@/lib/image/prepare";
import { JPEG_CROP_QUALITY, JPEG_PREVIEW_QUALITY, canvasToJpeg, createCanvas, placeRotated, releaseCanvas } from "./canvas";
import { planCrop } from "./crop-plan";
import { photoSourceKey } from "./draft-store";
import { displayedSize, type Rect, type Rotation } from "./geometry";
import { MAX_PHOTO_PAGES } from "./model";
import { SourceError, throwIfAborted, type PageSize, type PageSource } from "./sources";

export function validatePhotoFiles(files: readonly { size: number }[]): void {
  if (files.length === 0) throw new SourceError("empty", "Fotoğraf seçilmedi.");
  if (files.length > MAX_PHOTO_PAGES) throw new SourceError("tooManyPages", `En fazla ${MAX_PHOTO_PAGES} fotoğraf seçebilirsiniz.`);
  if (files.some((file) => file.size === 0)) throw new SourceError("empty", "Seçtiğiniz fotoğraflardan biri boş.");
}

export async function openImageSource(files: readonly File[], deps: ImageDeps): Promise<PageSource> {
  validatePhotoFiles(files);
  const sizes: PageSize[] = [];
  for (const file of files) {
    let decoded: Decoded;
    try {
      decoded = await decode(file, deps);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Fotoğraf okunamadı.";
      throw new SourceError("invalid", `${file.name}: ${reason}`);
    }
    sizes.push({ width: decoded.width, height: decoded.height });
    deps.release(decoded);
  }

  let cached: { page: number; decoded: Decoded } | null = null;
  let disposed = false;
  let chain: Promise<unknown> = Promise.resolve();

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const next = chain.then(task, task);
    chain = next.catch(() => null);
    return next;
  }

  async function decodePage(page: number): Promise<Decoded> {
    if (cached?.page === page) return cached.decoded;
    if (cached) deps.release(cached.decoded);
    cached = null;
    const file = files[page];
    if (!file) throw new SourceError("render", "Sayfa bulunamadı.");
    let decoded: Decoded;
    try {
      decoded = await decode(file, deps);
    } catch {
      throw new SourceError("invalid", `${file.name} okunamadı.`);
    }
    if (disposed) {
      deps.release(decoded);
      throw new SourceError("aborted", "İşlem iptal edildi.");
    }
    cached = { page, decoded };
    return decoded;
  }

  return {
    kind: "image",
    key: photoSourceKey(files),
    pageCount: files.length,
    pageSize: (page) => sizes[page] ?? { width: 1, height: 1 },
    renderPreview: (page, maxEdge, rotation, signal) => serial(async () => {
      throwIfAborted(signal);
      const decoded = await decodePage(page);
      throwIfAborted(signal);
      const view = displayedSize(decoded.width, decoded.height, rotation);
      const scale = Math.min(1, maxEdge / Math.max(view.width, view.height));
      const { canvas, context } = createCanvas(view.width * scale, view.height * scale);
      try {
        placeRotated(context, decoded.handle as CanvasImageSource, decoded.width, decoded.height, rotation, scale, 0, 0);
        return await canvasToJpeg(canvas, JPEG_PREVIEW_QUALITY);
      } finally {
        releaseCanvas(canvas);
      }
    }),
    renderCrop: (page, rect: Rect, rotation: Rotation, signal) => serial(async () => {
      throwIfAborted(signal);
      const decoded = await decodePage(page);
      throwIfAborted(signal);
      const view = displayedSize(decoded.width, decoded.height, rotation);
      const plan = planCrop(rect.width * view.width, rect.height * view.height, { maxScale: 1 });
      if (!plan.ok) throw new SourceError(plan.reason, plan.message);
      const { canvas, context } = createCanvas(plan.width, plan.height);
      try {
        placeRotated(context, decoded.handle as CanvasImageSource, decoded.width, decoded.height, rotation, plan.scale, rect.x * view.width * plan.scale, rect.y * view.height * plan.scale);
        return await canvasToJpeg(canvas, JPEG_CROP_QUALITY);
      } finally {
        releaseCanvas(canvas);
      }
    }),
    dispose() {
      disposed = true;
      if (cached) deps.release(cached.decoded);
      cached = null;
    },
  };
}
