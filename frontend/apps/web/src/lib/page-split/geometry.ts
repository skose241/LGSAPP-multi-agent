export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export type HandleName = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const HANDLES: readonly HandleName[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const MIN_SIDE = 0.03;
export const FULL_WIDTH = 0.7;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function clampRect(rect: Rect): Rect {
  const width = Math.min(1, Math.max(MIN_SIDE, rect.width));
  const height = Math.min(1, Math.max(MIN_SIDE, rect.height));
  const x = Math.min(1 - width, Math.max(0, rect.x));
  const y = Math.min(1 - height, Math.max(0, rect.y));
  return { x, y, width, height };
}

export function fromDrag(a: Point, b: Point): Rect {
  const x1 = clamp01(Math.min(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y));
  const x2 = clamp01(Math.max(a.x, b.x));
  const y2 = clamp01(Math.max(a.y, b.y));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function isBigEnough(rect: Rect): boolean {
  return rect.width >= MIN_SIDE && rect.height >= MIN_SIDE;
}

export function moveRect(rect: Rect, dx: number, dy: number): Rect {
  return {
    ...rect,
    x: Math.min(1 - rect.width, Math.max(0, rect.x + dx)),
    y: Math.min(1 - rect.height, Math.max(0, rect.y + dy)),
  };
}

export function resizeRect(rect: Rect, handle: HandleName, dx: number, dy: number): Rect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (handle.includes("w")) left = Math.min(right - MIN_SIDE, Math.max(0, left + dx));
  if (handle.includes("e")) right = Math.max(left + MIN_SIDE, Math.min(1, right + dx));
  if (handle.includes("n")) top = Math.min(bottom - MIN_SIDE, Math.max(0, top + dy));
  if (handle.includes("s")) bottom = Math.max(top + MIN_SIDE, Math.min(1, bottom + dy));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function handlePosition(rect: Rect, handle: HandleName): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const x = handle.includes("w") ? rect.x : handle.includes("e") ? right : cx;
  const y = handle.includes("n") ? rect.y : handle.includes("s") ? bottom : cy;
  return { x, y };
}

export function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function hitTest(rects: readonly Rect[], point: Point): number {
  for (let index = rects.length - 1; index >= 0; index -= 1) {
    const rect = rects[index];
    if (rect && contains(rect, point)) return index;
  }
  return -1;
}

export function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

export function overlapRatio(a: Rect, b: Rect): number {
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 ? overlapArea(a, b) / smaller : 0;
}

export function mergeRects(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

export type Rotation = 0 | 90 | 180 | 270;

export function rotateBy(rotation: Rotation, delta: 90 | -90): Rotation {
  return ((rotation + delta + 360) % 360) as Rotation;
}

export function unrotateRect(rect: Rect, rotation: Rotation): Rect {
  switch (rotation) {
    case 90:
      return { x: rect.y, y: 1 - rect.x - rect.width, width: rect.height, height: rect.width };
    case 180:
      return { x: 1 - rect.x - rect.width, y: 1 - rect.y - rect.height, width: rect.width, height: rect.height };
    case 270:
      return { x: 1 - rect.y - rect.height, y: rect.x, width: rect.height, height: rect.width };
    default:
      return rect;
  }
}

export function displayedSize(width: number, height: number, rotation: Rotation): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

export function toPixels(rect: Rect, width: number, height: number, rotation: Rotation = 0): Rect {
  const source = unrotateRect(rect, rotation);
  const x = Math.min(width - 1, Math.max(0, Math.round(source.x * width)));
  const y = Math.min(height - 1, Math.max(0, Math.round(source.y * height)));
  const right = Math.min(width, Math.round((source.x + source.width) * width));
  const bottom = Math.min(height, Math.round((source.y + source.height) * height));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

export function sortReadingOrder<T extends { rect: Rect }>(items: readonly T[]): T[] {
  const byTop = [...items].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const result: T[] = [];
  let group: T[] = [];

  function flush() {
    if (group.length === 0) return;
    result.push(...orderColumns(group));
    group = [];
  }

  for (const item of byTop) {
    if (item.rect.width >= FULL_WIDTH) {
      flush();
      result.push(item);
    } else {
      group.push(item);
    }
  }
  flush();
  return result;
}

function orderColumns<T extends { rect: Rect }>(items: readonly T[]): T[] {
  const byLeft = [...items].sort((a, b) => a.rect.x - b.rect.x);
  const columns: { left: number; right: number; items: T[] }[] = [];
  for (const item of byLeft) {
    const itemLeft = item.rect.x;
    const itemRight = item.rect.x + item.rect.width;
    const column = columns.find((entry) => {
      const overlap = Math.min(entry.right, itemRight) - Math.max(entry.left, itemLeft);
      const narrower = Math.min(entry.right - entry.left, item.rect.width);
      return narrower > 0 && overlap / narrower >= 0.5;
    });
    if (column) {
      column.items.push(item);
      column.left = Math.min(column.left, itemLeft);
      column.right = Math.max(column.right, itemRight);
    } else {
      columns.push({ left: itemLeft, right: itemRight, items: [item] });
    }
  }
  columns.sort((a, b) => a.left - b.left);
  return columns.flatMap((column) => column.items.sort((a, b) => a.rect.y - b.rect.y));
}
