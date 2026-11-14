import { describe, expect, it } from "vitest";
import { fieldError, parseProblem, parseRetryAfter } from "../problem";

describe("parseProblem", () => {
  it("detail alanını title alanına tercih eder", () => {
    const result = parseProblem({ title: "Hata", detail: "Ayrıntı" });
    expect(result.message).toBe("Ayrıntı");
  });

  it("detail yoksa title kullanır", () => {
    expect(parseProblem({ title: "Geçersiz istek" }).message).toBe("Geçersiz istek");
  });

  it("gövde anlamsızsa varsayılan mesajı verir", () => {
    expect(parseProblem(null).message).toBe("Beklenmeyen bir hata oluştu.");
    expect(parseProblem("metin").message).toBe("Beklenmeyen bir hata oluştu.");
  });

  it("errors anahtarlarını küçük harfe çevirir", () => {
    const result = parseProblem({ errors: { UserName: ["Zorunlu"], Password: ["Kısa", "Zayıf"] } });
    expect(result.fieldErrors).toEqual({ username: ["Zorunlu"], password: ["Kısa", "Zayıf"] });
    expect(fieldError(result, "userName")).toBe("Zorunlu");
  });

  it("farklı yazımdaki aynı anahtarı birleştirir", () => {
    const result = parseProblem({ errors: { Ad: ["a"], ad: ["b"] } });
    expect(result.fieldErrors).toEqual({ ad: ["a", "b"] });
  });

  it("boş anahtarı formError yapar", () => {
    const result = parseProblem({ errors: { "": ["Geçersiz JSON."] } });
    expect(result.formError).toBe("Geçersiz JSON.");
    expect(result.fieldErrors).toEqual({});
  });

  it("dize olarak gelen hata değerini kabul eder", () => {
    expect(parseProblem({ errors: { Ad: "Zorunlu" } }).fieldErrors).toEqual({ ad: ["Zorunlu"] });
  });

  it("retryAfter saniye başlığını okur", () => {
    expect(parseProblem({}, "30").retryAfter).toBe(30);
    expect(parseProblem({}).retryAfter).toBeNull();
  });
});

describe("parseRetryAfter", () => {
  it("HTTP tarihini saniyeye çevirir", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    expect(parseRetryAfter("Sat, 14 Nov 2026 10:00:45 GMT", now)).toBe(45);
  });

  it("geçmiş tarih için sıfır döner", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    expect(parseRetryAfter("Sat, 14 Nov 2026 09:00:00 GMT", now)).toBe(0);
  });

  it("geçersiz değerde null döner", () => {
    expect(parseRetryAfter("yarın")).toBeNull();
    expect(parseRetryAfter("")).toBeNull();
    expect(parseRetryAfter(-3)).toBeNull();
  });
});
