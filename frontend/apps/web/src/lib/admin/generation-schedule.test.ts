import type { GenerationSchedule } from "@lgs/api/queries";
import { describe, expect, it } from "vitest";
import { buildItems, changedKeys, dayTotal, mapServerErrors, validateAll, validateCell } from "./generation-schedule";

const schedule: GenerationSchedule = {
  lessons: [
    { id: 10, name: "Matematik" },
    { id: 11, name: "Fen" },
  ],
  items: [
    { isoDayOfWeek: 1, lessonId: 10, questionCount: 3 },
    { isoDayOfWeek: 2, lessonId: 11, questionCount: 0 },
  ],
};

describe("hücre doğrulama", () => {
  it("0..20 tam sayıyı kabul eder", () => {
    expect(validateCell("0")).toBeUndefined();
    expect(validateCell(" 20 ")).toBeUndefined();
  });

  it("boş, negatif, ondalıklı, harf ve büyük değerleri reddeder", () => {
    for (const raw of ["", " ", "-1", "1.5", "abc", "21", "1e2"]) expect(validateCell(raw)).toBeDefined();
  });
});

describe("değişiklik ve gövde", () => {
  it("aynı değere dönen hücre değişiklik sayılmaz", () => {
    expect(changedKeys(schedule, { "1-10": "3", "3-10": "0" })).toEqual([]);
    expect(changedKeys(schedule, { "1-10": "4" })).toEqual(["1-10"]);
  });

  it("mevcut satırları korur, yeni sıfırları göndermez", () => {
    const { items, keys } = buildItems(schedule, { "3-10": "5" });
    expect(keys).toEqual(["1-10", "2-11", "3-10"]);
    expect(items).toEqual([
      { isoDayOfWeek: 1, lessonId: 10, questionCount: 3 },
      { isoDayOfWeek: 2, lessonId: 11, questionCount: 0 },
      { isoDayOfWeek: 3, lessonId: 10, questionCount: 5 },
    ]);
  });

  it("gün toplamı hesaplanır", () => {
    expect(dayTotal(schedule, { "1-11": "2" }, 1)).toBe(5);
  });

  it("tümünü doğrular", () => {
    expect(Object.keys(validateAll(schedule, { "4-11": "99", "5-10": "x" })).sort()).toEqual(["4-11", "5-10"]);
  });
});

describe("sunucu hataları", () => {
  it("items[i] anahtarını hücreye bağlar", () => {
    const problem = { message: "x", formError: null, retryAfter: null, fieldErrors: { "items[1]": ["Ders bulunamadı."] } };
    expect(mapServerErrors(problem, ["1-10", "2-11"])).toEqual({ "2-11": "Ders bulunamadı." });
    expect(mapServerErrors(null, ["1-10"])).toEqual({});
  });
});
