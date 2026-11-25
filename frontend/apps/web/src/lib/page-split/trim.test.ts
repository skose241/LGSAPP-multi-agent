import { describe, expect, it } from "vitest";
import { findInkBounds, trimmedRect, type PixelData } from "./trim";

function canvas(width: number, height: number, paint: (x: number, y: number) => number | null): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = paint(x, y) ?? 255;
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

const block = (left: number, top: number, right: number, bottom: number, value = 40) => (x: number, y: number) => (x >= left && x < right && y >= top && y < bottom ? value : null);

describe("findInkBounds", () => {
  it("beyaz kenarların içindeki mürekkep alanını bulur", () => {
    expect(findInkBounds(canvas(100, 100, block(20, 30, 60, 70)))).toEqual({ left: 20, top: 30, right: 60, bottom: 70 });
  });

  it("tamamen beyaz görüntü için null döner", () => {
    expect(findInkBounds(canvas(50, 50, () => null))).toBeNull();
  });

  it("tek piksellik gürültüyü yok sayar", () => {
    const paint = (x: number, y: number) => (x === 3 && y === 4 ? 0 : block(20, 30, 60, 70)(x, y));
    expect(findInkBounds(canvas(100, 100, paint))).toEqual({ left: 20, top: 30, right: 60, bottom: 70 });
  });

  it("açık gri arka planı (eşik üstü) boş sayar", () => {
    expect(findInkBounds(canvas(40, 40, () => 248))).toBeNull();
  });

  it("açık renkli ama eşik altındaki dolguyu mürekkep sayar", () => {
    expect(findInkBounds(canvas(60, 60, block(10, 10, 30, 30, 215)))).toEqual({ left: 10, top: 10, right: 30, bottom: 30 });
  });

  it("şeffaf pikselleri beyaz sayar", () => {
    const pixels = canvas(20, 20, () => 0);
    for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = 0;
    expect(findInkBounds(pixels)).toBeNull();
  });

  it("geçersiz boyutta null döner", () => {
    expect(findInkBounds({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toBeNull();
    expect(findInkBounds({ data: new Uint8ClampedArray(4), width: 10, height: 10 })).toBeNull();
  });

  it("ince çizgileri korur", () => {
    const paint = (x: number, y: number) => (y === 50 && x >= 10 && x < 90 ? 0 : null);
    expect(findInkBounds(canvas(100, 100, paint))).toBeNull();
    const thick = (x: number, y: number) => (y >= 50 && y < 53 && x >= 10 && x < 90 ? 0 : null);
    expect(findInkBounds(canvas(100, 100, thick))).toEqual({ left: 10, top: 50, right: 90, bottom: 53 });
  });
});

describe("trimmedRect", () => {
  const rect = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };

  it("sınırları çerçeve içine eşler ve pay bırakır", () => {
    const result = trimmedRect(rect, { left: 20, top: 30, right: 60, bottom: 70 }, 100, 100, 0.02);
    expect(result.changed).toBe(true);
    expect(result.rect.x).toBeCloseTo(0.1 + 0.18 * 0.5, 5);
    expect(result.rect.y).toBeCloseTo(0.2 + 0.28 * 0.4, 5);
    expect(result.rect.width).toBeCloseTo((0.62 - 0.18) * 0.5, 5);
    expect(result.rect.height).toBeCloseTo((0.72 - 0.28) * 0.4, 5);
  });

  it("çerçeveyi asla büyütmez", () => {
    const result = trimmedRect(rect, { left: 0, top: 0, right: 100, bottom: 100 }, 100, 100);
    expect(result.changed).toBe(false);
    expect(result.rect).toEqual(rect);
    expect(trimmedRect(rect, { left: 1, top: 1, right: 99, bottom: 99 }, 100, 100).changed).toBe(false);
  });

  it("boşluk yoksa ya da sınır yoksa dokunmaz", () => {
    expect(trimmedRect(rect, null, 100, 100)).toEqual({ rect, changed: false });
    expect(trimmedRect(rect, { left: 5, top: 5, right: 5, bottom: 5 }, 0, 0)).toEqual({ rect, changed: false });
  });

  it("çok küçük içeriği en az kenar boyuna yükseltir", () => {
    const result = trimmedRect(rect, { left: 50, top: 50, right: 51, bottom: 51 }, 100, 100, 0);
    expect(result.rect.width).toBeGreaterThanOrEqual(0.03);
    expect(result.rect.height).toBeGreaterThanOrEqual(0.03);
    expect(result.rect.x + result.rect.width).toBeLessThanOrEqual(1);
  });

  it("boyalı görüntüden küçülmüş çerçeve üretir", () => {
    const pixels = canvas(200, 100, block(40, 20, 120, 80));
    const result = trimmedRect({ x: 0, y: 0, width: 1, height: 1 }, findInkBounds(pixels), pixels.width, pixels.height);
    expect(result.changed).toBe(true);
    expect(result.rect.x).toBeGreaterThan(0.1);
    expect(result.rect.x + result.rect.width).toBeLessThan(0.7);
    expect(result.rect.y).toBeGreaterThan(0.1);
  });
});
