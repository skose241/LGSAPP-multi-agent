import { describe, expect, it } from "vitest";
import { cardsSelectable, textOrNull, validateComposerCard, validateTextQuestion } from "./composer";

describe("toplu kart doğrulaması", () => {
  it("doğru şık zorunludur, açıklama isteğe bağlıdır", () => {
    expect(validateComposerCard({ option: undefined, description: "" }).option).toBeTruthy();
    expect(validateComposerCard({ option: "B", description: "" })).toEqual({});
    expect(validateComposerCard({ option: "B", description: "x".repeat(2001) }).description).toBeTruthy();
  });

  it("seçilebilir kart sayısı kalan yerle sınırlıdır", () => {
    expect(cardsSelectable(0, 20)).toBe(20);
    expect(cardsSelectable(12, 20)).toBe(8);
    expect(cardsSelectable(25, 20)).toBe(0);
  });

  it("boş metni null yapar", () => {
    expect(textOrNull("  ")).toBeNull();
    expect(textOrNull(" a ")).toBe("a");
  });
});

describe("metin sorusu doğrulaması", () => {
  const empty: [string, string, string, string] = ["", "", "", ""];

  it("metin ve doğru şık zorunludur", () => {
    const errors = validateTextQuestion({ text: "", options: empty, option: undefined });
    expect(errors.text).toBeTruthy();
    expect(errors.option).toBeTruthy();
    expect(errors.options).toBeUndefined();
  });

  it("şıklar ya hep birlikte ya hiç girilir", () => {
    expect(validateTextQuestion({ text: "Soru", options: ["a", "b", "", ""], option: "A" }).options).toBeTruthy();
    expect(validateTextQuestion({ text: "Soru", options: ["a", "b", "c", "d"], option: "A" })).toEqual({});
    expect(validateTextQuestion({ text: "Soru", options: empty, option: "C" })).toEqual({});
  });
});
