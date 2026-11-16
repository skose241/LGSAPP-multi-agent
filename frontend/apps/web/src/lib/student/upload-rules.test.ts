import { describe, expect, it } from "vitest";
import { hasErrors, scoredSentence, selectableSlots, solutionTextState, validateQuestionCard } from "./upload-rules";

describe("çözüm metni kuralı", () => {
  it("fotoğraf yokken en az karakter gerekir", () => {
    expect(solutionTextState({ length: 5, min: 20, max: 2000, hasPhoto: false })).toEqual({ valid: false, tooShort: true, tooLong: false });
    expect(solutionTextState({ length: 20, min: 20, max: 2000, hasPhoto: false }).valid).toBe(true);
  });

  it("fotoğraf varsa metin isteğe bağlıdır ama üst sınır geçerlidir", () => {
    expect(solutionTextState({ length: 0, min: 20, max: 2000, hasPhoto: true }).valid).toBe(true);
    expect(solutionTextState({ length: 3, min: 20, max: 2000, hasPhoto: true }).valid).toBe(true);
    expect(solutionTextState({ length: 2001, min: 20, max: 2000, hasPhoto: true })).toEqual({ valid: false, tooShort: false, tooLong: true });
  });
});

describe("soru kartı doğrulama", () => {
  it("eksik alanları bildirir", () => {
    const errors = validateQuestionCard({ lessonId: null, option: undefined, description: "" }, 20);
    expect(errors.lesson).toBeDefined();
    expect(errors.option).toBeDefined();
    expect(errors.description).toContain("anlat");
    expect(hasErrors(errors)).toBe(true);
  });

  it("kısa açıklamayı reddeder, yeterliyi kabul eder", () => {
    expect(validateQuestionCard({ lessonId: 1, option: "A", description: "kısa" }, 20).description).toContain("en az 20");
    expect(hasErrors(validateQuestionCard({ lessonId: 1, option: "B", description: "x".repeat(20) }, 20))).toBe(false);
  });

  it("boşlukları saymaz ve 4000 üstünü reddeder", () => {
    expect(validateQuestionCard({ lessonId: 1, option: "A", description: `  ${"x".repeat(19)}  ` }, 20).description).toBeDefined();
    expect(validateQuestionCard({ lessonId: 1, option: "A", description: "x".repeat(4001) }, 20).description).toContain("4000");
  });
});

describe("günlük hak", () => {
  it("puanlı hak cümlesini üretir, limit 0 ise üretmez", () => {
    expect(scoredSentence({ scoredLimit: 5, scoredRemaining: 3, pointsPerQuestion: 2 })).toBe("İlk 5 soru puanlı. 3 puanlı hakkın kaldı. Her biri 2 puan kazandırır.");
    expect(scoredSentence({ scoredLimit: 5, scoredRemaining: 0, pointsPerQuestion: 0 })).toBe("İlk 5 soru puanlı. 0 puanlı hakkın kaldı.");
    expect(scoredSentence({ scoredLimit: 0, scoredRemaining: 0, pointsPerQuestion: 2 })).toBeNull();
    expect(scoredSentence(undefined)).toBeNull();
  });

  it("seçilebilir fotoğraf sayısını kota ve üst sınırla sınırlar", () => {
    expect(selectableSlots(15, 3)).toBe(12);
    expect(selectableSlots(2, 5)).toBe(0);
    expect(selectableSlots(null, 18)).toBe(2);
    expect(selectableSlots(50, 0)).toBe(20);
  });
});
