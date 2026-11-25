import { clampRect, type Rect } from "./geometry";

export interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface TrimBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TrimOptions {
  threshold?: number;
  noise?: number;
}

export const TRIM_THRESHOLD = 240;
export const TRIM_NOISE = 0.01;
export const TRIM_PADDING = 0.012;
export const TRIM_MIN_GAIN = 0.02;

function isInk(data: Uint8ClampedArray, index: number, threshold: number): boolean {
  const alpha = data[index + 3] ?? 255;
  if (alpha < 16) return false;
  const luma = 0.299 * (data[index] ?? 255) + 0.587 * (data[index + 1] ?? 255) + 0.114 * (data[index + 2] ?? 255);
  return luma < threshold;
}

export function findInkBounds({ data, width, height }: PixelData, options: TrimOptions = {}): TrimBounds | null {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return null;
  const threshold = options.threshold ?? TRIM_THRESHOLD;
  const noise = options.noise ?? TRIM_NOISE;
  const rows = new Array<number>(height).fill(0);
  const columns = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isInk(data, (y * width + x) * 4, threshold)) {
        rows[y] = (rows[y] ?? 0) + 1;
        columns[x] = (columns[x] ?? 0) + 1;
      }
    }
  }
  const rowNeed = Math.max(2, Math.ceil(width * noise));
  const columnNeed = Math.max(2, Math.ceil(height * noise));
  const top = rows.findIndex((count) => count >= rowNeed);
  if (top < 0) return null;
  const bottom = rows.length - 1 - [...rows].reverse().findIndex((count) => count >= rowNeed);
  const left = columns.findIndex((count) => count >= columnNeed);
  if (left < 0) return null;
  const right = columns.length - 1 - [...columns].reverse().findIndex((count) => count >= columnNeed);
  return { left, top, right: right + 1, bottom: bottom + 1 };
}

export function trimmedRect(rect: Rect, bounds: TrimBounds | null, width: number, height: number, padding = TRIM_PADDING): { rect: Rect; changed: boolean } {
  if (!bounds || width <= 0 || height <= 0) return { rect, changed: false };
  const padX = Math.max(2, Math.round(width * padding));
  const padY = Math.max(2, Math.round(height * padding));
  const left = Math.max(0, bounds.left - padX) / width;
  const top = Math.max(0, bounds.top - padY) / height;
  const right = Math.min(width, bounds.right + padX) / width;
  const bottom = Math.min(height, bounds.bottom + padY) / height;
  if (right <= left || bottom <= top) return { rect, changed: false };
  const next = clampRect({
    x: rect.x + left * rect.width,
    y: rect.y + top * rect.height,
    width: (right - left) * rect.width,
    height: (bottom - top) * rect.height,
  });
  const before = rect.width * rect.height;
  const after = next.width * next.height;
  if (before <= 0 || (before - after) / before < TRIM_MIN_GAIN) return { rect, changed: false };
  return { rect: next, changed: true };
}
