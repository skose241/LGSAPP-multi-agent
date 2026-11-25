import { createCanvas, releaseCanvas } from "./canvas";
import type { Rect, Rotation } from "./geometry";
import type { PageSource } from "./sources";
import { findInkBounds, trimmedRect } from "./trim";

const SAMPLE_EDGE = 480;

export async function trimBoxRect(source: PageSource, page: number, rect: Rect, rotation: Rotation, signal?: AbortSignal): Promise<{ rect: Rect; changed: boolean }> {
  const blob = await source.renderCrop(page, rect, rotation, signal);
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const { canvas, context } = createCanvas(width, height);
    try {
      context.drawImage(bitmap, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      return trimmedRect(rect, findInkBounds(pixels), canvas.width, canvas.height);
    } finally {
      releaseCanvas(canvas);
    }
  } finally {
    bitmap.close();
  }
}
