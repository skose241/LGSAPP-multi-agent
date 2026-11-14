import { describe, expect, it } from "vitest";
import { letterToOption, optionToLetter } from "../options";

describe("şık dönüşümü", () => {
  it("1..4 değerlerini A..D yapar", () => {
    expect([1, 2, 3, 4].map(optionToLetter)).toEqual(["A", "B", "C", "D"]);
  });

  it("aralık dışını reddeder", () => {
    expect(optionToLetter(0)).toBeNull();
    expect(optionToLetter(5)).toBeNull();
    expect(optionToLetter(1.5)).toBeNull();
  });

  it("harfi sayıya çevirir", () => {
    expect(["A", "b", " C ", "D"].map(letterToOption)).toEqual([1, 2, 3, 4]);
  });

  it("geçersiz harfi reddeder", () => {
    expect(letterToOption("E")).toBeNull();
    expect(letterToOption("")).toBeNull();
  });
});
