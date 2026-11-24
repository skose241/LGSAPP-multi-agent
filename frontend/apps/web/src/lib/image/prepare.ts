import { PrepareError, type PreparedImage } from "@lgs/api";

export const MAX_EDGE = 2000;
export const JPEG_QUALITY = 0.85;
export const PREVIEW_EDGE = 480;
export const PREVIEW_QUALITY = 0.7;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const SAFE_UPLOAD_BYTES = Math.floor(MAX_UPLOAD_BYTES * 0.95);
export const MIN_EDGE = 200;
export const MIN_ENCODED_BYTES = 64;
const RENDER_ATTEMPTS = 2;

export interface EncodeStep {
  edge: number;
  quality: number;
}

export const ENCODE_LADDER: readonly EncodeStep[] = [
  { edge: MAX_EDGE, quality: JPEG_QUALITY },
  { edge: MAX_EDGE, quality: 0.7 },
  { edge: 1600, quality: 0.7 },
  { edge: 1280, quality: 0.65 },
];

export interface Decoded {
  width: number;
  height: number;
  handle: unknown;
}

export interface ImageDeps {
  decodeNative(blob: Blob): Promise<Decoded>;
  decodeHeic(blob: Blob): Promise<Decoded>;
  render(decoded: Decoded, width: number, height: number, quality: number): Promise<Blob>;
  release(decoded: Decoded): void;
}

export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const HEIC_EXTENSION = /\.(heic|heif|hif)$/i;
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

export function isHeicLike(file: { type?: string; name?: string }): boolean {
  const type = (file.type ?? "").toLowerCase();
  if (HEIC_TYPES.has(type)) return true;
  return HEIC_EXTENSION.test(file.name ?? "");
}

export function sniffHeicBrand(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const text = (from: number) => String.fromCharCode(bytes[from]!, bytes[from + 1]!, bytes[from + 2]!, bytes[from + 3]!);
  return text(4) === "ftyp" && HEIC_BRANDS.has(text(8));
}

async function looksHeic(file: Blob & { name?: string }): Promise<boolean> {
  if (isHeicLike(file)) return true;
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    return sniffHeicBrand(head);
  } catch {
    return false;
  }
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new DOMException("Hazırlama iptal edildi.", "AbortError");
}

const HEIC_FAILED = "Bu HEIC fotoğrafı dönüştürülemedi. Fotoğrafı JPEG olarak kaydedip tekrar deneyin.";
const DECODE_FAILED = "Fotoğraf okunamadı. Başka bir fotoğraf seçip tekrar deneyin.";

export async function decode(file: Blob & { name?: string }, deps: ImageDeps): Promise<Decoded> {
  if (await looksHeic(file)) {
    try {
      return await deps.decodeHeic(file);
    } catch {
      throw new PrepareError("heic", HEIC_FAILED);
    }
  }
  try {
    return await deps.decodeNative(file);
  } catch {
    try {
      return await deps.decodeHeic(file);
    } catch {
      throw new PrepareError("decode", DECODE_FAILED);
    }
  }
}

export async function prepareImage(
  file: Blob & { name?: string },
  deps: ImageDeps,
  options: { signal?: AbortSignal } = {},
): Promise<PreparedImage> {
  throwIfAborted(options.signal);
  const decoded = await decode(file, deps);
  try {
    throwIfAborted(options.signal);
    if (Math.min(decoded.width, decoded.height) < MIN_EDGE) {
      throw new PrepareError("tooSmall", `Fotoğraf çok küçük. Kısa kenarı en az ${MIN_EDGE} piksel olmalı.`);
    }

    let result: { blob: Blob; width: number; height: number } | null = null;
    for (const step of ENCODE_LADDER) {
      const size = fitWithin(decoded.width, decoded.height, step.edge);
      let blob: Blob | null = null;
      for (let attempt = 0; attempt < RENDER_ATTEMPTS && !blob; attempt += 1) {
        try {
          const rendered = await deps.render(decoded, size.width, size.height, step.quality);
          if (rendered.size >= MIN_ENCODED_BYTES) blob = rendered;
        } catch (error) {
          console.warn("[image/prepare] render failed", error);
          blob = null;
        }
        throwIfAborted(options.signal);
      }
      if (!blob) throw new PrepareError("encode", "Fotoğraf küçültülemedi. Tekrar deneyin ya da başka bir fotoğraf seçin.");
      throwIfAborted(options.signal);
      if (blob.size <= SAFE_UPLOAD_BYTES) {
        result = { blob, width: size.width, height: size.height };
        break;
      }
    }
    if (!result) {
      throw new PrepareError("tooLarge", "Fotoğraf küçültülse de 10 MB'ın altına inmedi. Başka bir fotoğraf deneyin.");
    }

    let previewBlob: Blob | null = null;
    try {
      const preview = fitWithin(decoded.width, decoded.height, PREVIEW_EDGE);
      previewBlob = await deps.render(decoded, preview.width, preview.height, PREVIEW_QUALITY);
    } catch (error) {
      console.warn("[image/prepare] preview render failed", error);
      previewBlob = null;
    }

    return { blob: result.blob, width: result.width, height: result.height, previewBlob };
  } finally {
    deps.release(decoded);
  }
}
