import { describe, expect, it } from "vitest";
import {
  MIN_SIDE,
  clampRect,
  displayedSize,
  fromDrag,
  handlePosition,
  hitTest,
  isBigEnough,
  mergeRects,
  moveRect,
  overlapRatio,
  resizeRect,
  rotateBy,
  sortReadingOrder,
  toPixels,
  unrotateRect,
  type Rect,
} from "./geometry";

const box = (x: number, y: number, width: number, height: number) => ({ rect: { x, y, width, height } });

describe("geometry", () => {
  it("fromDrag her yönde aynı dikdörtgeni verir ve sınırlara kırpar", () => {
    expect(fromDrag({ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, width: expect.closeTo(0.3, 6), height: expect.closeTo(0.4, 6) });
    expect(fromDrag({ x: -1, y: 0.2 }, { x: 2, y: 3 })).toEqual({ x: 0, y: 0.2, width: 1, height: expect.closeTo(0.8, 6) });
  });

  it("isBigEnough en küçük kenarı denetler", () => {
    expect(isBigEnough({ x: 0, y: 0, width: MIN_SIDE, height: MIN_SIDE })).toBe(true);
    expect(isBigEnough({ x: 0, y: 0, width: MIN_SIDE / 2, height: 0.5 })).toBe(false);
  });

  it("clampRect çerçeveyi sayfa içinde tutar", () => {
    expect(clampRect({ x: 0.9, y: -0.2, width: 0.3, height: 0.01 })).toEqual({ x: 0.7, y: 0, width: 0.3, height: MIN_SIDE });
  });

  it("moveRect boyutu korur ve kenarda durur", () => {
    expect(moveRect({ x: 0.5, y: 0.5, width: 0.3, height: 0.3 }, 0.5, -0.9)).toEqual({ x: 0.7, y: 0, width: 0.3, height: 0.3 });
  });

  it("resizeRect karşı kenarı sabit tutar ve en küçük boyutun altına inmez", () => {
    const start: Rect = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
    expect(resizeRect(start, "se", 0.1, 0.2)).toEqual({ x: 0.2, y: 0.2, width: expect.closeTo(0.5, 6), height: expect.closeTo(0.6, 6) });
    const shrunk = resizeRect(start, "nw", 0.9, 0.9);
    expect(shrunk.width).toBeCloseTo(MIN_SIDE, 6);
    expect(shrunk.x + shrunk.width).toBeCloseTo(0.6, 6);
    const widened = resizeRect(start, "e", 5, 0);
    expect(widened.x + widened.width).toBeCloseTo(1, 6);
    expect(resizeRect(start, "n", 0, -5).y).toBe(0);
  });

  it("handlePosition tutamaç noktalarını verir", () => {
    const rect: Rect = { x: 0.2, y: 0.4, width: 0.2, height: 0.2 };
    expect(handlePosition(rect, "nw")).toEqual({ x: 0.2, y: 0.4 });
    expect(handlePosition(rect, "se").x).toBeCloseTo(0.4, 6);
    expect(handlePosition(rect, "n")).toEqual({ x: expect.closeTo(0.3, 6), y: 0.4 });
  });

  it("hitTest üstteki (son) çerçeveyi seçer", () => {
    const rects: Rect[] = [
      { x: 0, y: 0, width: 0.5, height: 0.5 },
      { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    ];
    expect(hitTest(rects, { x: 0.3, y: 0.3 })).toBe(1);
    expect(hitTest(rects, { x: 0.1, y: 0.1 })).toBe(0);
    expect(hitTest(rects, { x: 0.95, y: 0.95 })).toBe(-1);
  });

  it("overlapRatio ve mergeRects", () => {
    const a: Rect = { x: 0, y: 0, width: 0.5, height: 0.5 };
    const b: Rect = { x: 0.25, y: 0, width: 0.5, height: 0.5 };
    expect(overlapRatio(a, b)).toBeCloseTo(0.5, 6);
    expect(overlapRatio(a, { x: 0.6, y: 0.6, width: 0.1, height: 0.1 })).toBe(0);
    expect(mergeRects(a, b)).toEqual({ x: 0, y: 0, width: 0.75, height: 0.5 });
  });

  it("döndürme dönüşümleri kaynak çerçevesine doğru eşler", () => {
    const rect: Rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    expect(unrotateRect(rect, 0)).toEqual(rect);
    const r90 = unrotateRect(rect, 90);
    expect(r90.x).toBeCloseTo(0.2, 6);
    expect(r90.y).toBeCloseTo(0.6, 6);
    expect(r90.width).toBeCloseTo(0.4, 6);
    expect(r90.height).toBeCloseTo(0.3, 6);
    const r180 = unrotateRect(rect, 180);
    expect(r180.x).toBeCloseTo(0.6, 6);
    expect(r180.y).toBeCloseTo(0.4, 6);
    const back = unrotateRect(unrotateRect(rect, 90), 270);
    expect(back.x).toBeCloseTo(rect.x, 6);
    expect(back.width).toBeCloseTo(rect.width, 6);
    expect(rotateBy(270, 90)).toBe(0);
    expect(rotateBy(0, -90)).toBe(270);
    expect(displayedSize(400, 300, 90)).toEqual({ width: 300, height: 400 });
  });

  it("toPixels döndürmeyi hesaba katıp tam sayı ve sınır içi verir", () => {
    expect(toPixels({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 1000, 800)).toEqual({ x: 250, y: 200, width: 500, height: 400 });
    const rotated = toPixels({ x: 0, y: 0, width: 0.5, height: 1 }, 1000, 800, 90);
    expect(rotated.x).toBe(0);
    expect(rotated.y).toBe(400);
    expect(rotated.width).toBe(1000);
    expect(rotated.height).toBe(400);
    const edge = toPixels({ x: 0.999, y: 0.999, width: 0.001, height: 0.001 }, 100, 100);
    expect(edge.width).toBeGreaterThanOrEqual(1);
    expect(edge.x + edge.width).toBeLessThanOrEqual(100);
  });
});

describe("sortReadingOrder", () => {
  it("iki sütunlu sayfada önce sol sütunu yukarıdan aşağı okur", () => {
    const items = [
      { id: "r1", ...box(0.52, 0.05, 0.43, 0.2) },
      { id: "l2", ...box(0.05, 0.3, 0.43, 0.2) },
      { id: "l1", ...box(0.05, 0.05, 0.43, 0.2) },
      { id: "r2", ...box(0.52, 0.3, 0.43, 0.2) },
    ];
    expect(sortReadingOrder(items).map((item) => item.id)).toEqual(["l1", "l2", "r1", "r2"]);
  });

  it("tam genişlikli çerçeve sütun gruplarını ayırır", () => {
    const items = [
      { id: "wide", ...box(0.05, 0.4, 0.9, 0.1) },
      { id: "b-right", ...box(0.52, 0.6, 0.43, 0.2) },
      { id: "a-left", ...box(0.05, 0.05, 0.43, 0.2) },
      { id: "b-left", ...box(0.05, 0.6, 0.43, 0.2) },
      { id: "a-right", ...box(0.52, 0.05, 0.43, 0.2) },
    ];
    expect(sortReadingOrder(items).map((item) => item.id)).toEqual(["a-left", "a-right", "wide", "b-left", "b-right"]);
  });

  it("tek sütunda yukarıdan aşağı sıralar ve girdiyi değiştirmez", () => {
    const items = [
      { id: "b", ...box(0.1, 0.5, 0.8, 0.2) },
      { id: "a", ...box(0.1, 0.1, 0.8, 0.2) },
    ];
    const copy = [...items];
    expect(sortReadingOrder(items).map((item) => item.id)).toEqual(["a", "b"]);
    expect(items).toEqual(copy);
  });
});
