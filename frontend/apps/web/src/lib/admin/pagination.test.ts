import { describe, expect, it } from "vitest";
import { paginate, pageWindow } from "./pagination";

const items = Array.from({ length: 60 }, (_, index) => index + 1);

describe("paginate", () => {
  it("ilk sayfayı 25 kayıtla verir", () => {
    const slice = paginate(items, 1);
    expect(slice.items).toHaveLength(25);
    expect(slice).toMatchObject({ page: 1, pageCount: 3, total: 60, from: 1, to: 25 });
  });

  it("son sayfada kalanı verir", () => {
    const slice = paginate(items, 3);
    expect(slice.items).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
    expect(slice).toMatchObject({ from: 51, to: 60 });
  });

  it("aralık dışı sayfayı sınırlar", () => {
    expect(paginate(items, 99).page).toBe(3);
    expect(paginate(items, 0).page).toBe(1);
    expect(paginate(items, Number.NaN).page).toBe(1);
  });

  it("boş listede 0-0 verir", () => {
    expect(paginate([], 1)).toMatchObject({ pageCount: 1, total: 0, from: 0, to: 0, items: [] });
  });
});

describe("pageWindow", () => {
  it("az sayfada hepsini listeler", () => {
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]);
  });

  it("çok sayfada boşluk belirteci koyar", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, "gap-end", 20]);
    expect(pageWindow(10, 20)).toEqual([1, "gap-start", 9, 10, 11, "gap-end", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap-start", 19, 20]);
  });
});
