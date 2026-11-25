import type { PDFPageProxy } from "pdfjs-dist";

export interface TextFragment {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
}

export interface ViewportLike {
  transform: readonly number[];
  width: number;
  height: number;
}

export interface RawTextItem {
  str?: string;
  transform?: readonly number[];
  width?: number;
  height?: number;
}

function multiply(m: readonly number[], n: readonly number[]): number[] {
  const [a1 = 1, b1 = 0, c1 = 0, d1 = 1, e1 = 0, f1 = 0] = m;
  const [a2 = 1, b2 = 0, c2 = 0, d2 = 1, e2 = 0, f2 = 0] = n;
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalizeTextItems(items: readonly RawTextItem[], viewport: ViewportLike): TextFragment[] {
  const result: TextFragment[] = [];
  if (!(viewport.width > 0) || !(viewport.height > 0)) return result;
  const viewportScale = Math.hypot(viewport.transform[0] ?? 1, viewport.transform[1] ?? 0) || 1;
  for (const item of items) {
    if (typeof item.str !== "string" || item.str.trim() === "" || !item.transform || item.transform.length < 6) continue;
    const m = multiply(viewport.transform, item.transform);
    const ax = m[0] ?? 0;
    const ay = m[1] ?? 0;
    const bx = m[2] ?? 0;
    const by = m[3] ?? 0;
    const originX = m[4] ?? 0;
    const originY = m[5] ?? 0;
    const along = Math.hypot(ax, ay);
    const up = Math.hypot(bx, by);
    if (!(along > 0) || !(up > 0)) continue;
    const length = Math.max(0, item.width ?? 0) * viewportScale;
    const unitX = ax / along;
    const unitY = ay / along;
    const xs = [originX, originX + unitX * length, originX + bx, originX + bx + unitX * length];
    const ys = [originY, originY + unitY * length, originY + by, originY + by + unitY * length];
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const x = clamp01(left / viewport.width);
    const y = clamp01(top / viewport.height);
    const w = clamp01(right / viewport.width) - x;
    const h = clamp01(bottom / viewport.height) - y;
    if (!(w > 0) || !(h > 0)) continue;
    const vertical = Math.abs(ax) < Math.abs(ay);
    result.push({ str: item.str, x, y, w, h, fontSize: vertical ? up / viewport.width : up / viewport.height });
  }
  return result;
}

export async function extractPageText(page: PDFPageProxy): Promise<TextFragment[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  return normalizeTextItems(content.items as readonly RawTextItem[], viewport);
}
