import { describe, expect, it } from "vitest";
import { applyAnswers, canMerge, cropFileName, numberFor, pendingBoxes, readingOrder, type SplitBox } from "./model";

function box(id: string, page: number, x: number, y: number, extra: Partial<SplitBox> = {}): SplitBox {
  return { id, page, rect: { x, y, width: 0.4, height: 0.2 }, option: undefined, transferred: false, ...extra };
}

describe("model", () => {
  const boxes = [box("p2", 1, 0.05, 0.1), box("r1", 0, 0.52, 0.1), box("l2", 0, 0.05, 0.4), box("l1", 0, 0.05, 0.1)];

  it("readingOrder sayfa sırasını ve sütun sırasını korur", () => {
    expect(readingOrder(boxes).map((entry) => entry.id)).toEqual(["l1", "l2", "r1", "p2"]);
    expect(numberFor(boxes, "r1")).toBe(3);
    expect(numberFor(boxes, "r1", 10)).toBe(12);
    expect(numberFor(boxes, "yok")).toBe(0);
  });

  it("applyAnswers numaraya göre şık yazar ve eşleşmeyenleri bildirir", () => {
    const result = applyAnswers(
      boxes,
      new Map([
        [1, "A"],
        [3, "C"],
        [9, "B"],
      ]),
    );
    expect(result.applied).toBe(2);
    expect(result.unmatched).toEqual([9]);
    expect(result.boxes.find((entry) => entry.id === "l1")?.option).toBe("A");
    expect(result.boxes.find((entry) => entry.id === "r1")?.option).toBe("C");
    expect(result.boxes.find((entry) => entry.id === "l2")?.option).toBeUndefined();
  });

  it("pendingBoxes aktarılanları dışarıda bırakır", () => {
    const list = [box("a", 0, 0.1, 0.1, { transferred: true }), box("b", 0, 0.1, 0.5)];
    expect(pendingBoxes(list).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("cropFileName sayfa ve soru numarasını iki haneye tamamlar", () => {
    expect(cropFileName(2, 5)).toBe("sayfa-03-soru-05.jpg");
    expect(cropFileName(11, 120)).toBe("sayfa-12-soru-120.jpg");
  });

  it("canMerge aktarılmış ya da farklı sayfadaki çerçeveleri birleştirmez", () => {
    const a = box("a", 0, 0.1, 0.1);
    expect(canMerge(a, box("b", 0, 0.1, 0.5))).toBe(true);
    expect(canMerge(a, box("b", 1, 0.1, 0.5))).toBe(false);
    expect(canMerge(box("a", 0, 0.1, 0.1, { transferred: true }), box("b", 0, 0.1, 0.5))).toBe(false);
    expect(canMerge(a, box("b", 0, 0.1, 0.5, { transferred: true }))).toBe(false);
  });
});
