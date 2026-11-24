import { describe, expect, it } from "vitest";
import { parseAnswerKey } from "./answer-key";

function entries(text: string, start = 1) {
  const parsed = parseAnswerKey(text, start);
  return { answers: Object.fromEntries(parsed.answers), invalid: parsed.invalid };
}

describe("parseAnswerKey", () => {
  it("numara + harf bitişik ve boşlukla ayrılmış biçimi okur", () => {
    expect(entries("1A 2C 3b").answers).toEqual({ 1: "A", 2: "C", 3: "B" });
  });

  it("ayraçlı biçimleri okur", () => {
    expect(entries("1-a, 2-b; 3.c 4) d 5:A").answers).toEqual({ 1: "A", 2: "B", 3: "C", 4: "D", 5: "A" });
  });

  it("numara ile harf arası boşluğu birleştirir", () => {
    expect(entries("1 - a\n2 b\n10 D").answers).toEqual({ 1: "A", 2: "B", 10: "D" });
  });

  it("yalnız harf dizisini ilk numaradan başlayarak sıralar", () => {
    expect(entries("ACBD").answers).toEqual({ 1: "A", 2: "C", 3: "B", 4: "D" });
    expect(entries("a c, b d", 21).answers).toEqual({ 21: "A", 22: "C", 23: "B", 24: "D" });
  });

  it("anlaşılamayan parçaları ayrı listeler", () => {
    const result = entries("1A xyz 2E 3C");
    expect(result.answers).toEqual({ 1: "A", 3: "C" });
    expect(result.invalid).toEqual(["xyz", "2E"]);
  });

  it("boş girdi boş sonuç verir ve aynı numarada son değer geçerli olur", () => {
    expect(entries("   ").answers).toEqual({});
    expect(entries("1A 1B").answers).toEqual({ 1: "B" });
  });
});
