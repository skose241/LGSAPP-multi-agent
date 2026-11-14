import { describe, expect, it } from "vitest";
import {
  addDaysToDateOnly,
  compareDateOnly,
  formatDateOnly,
  formatDateTime,
  formatTime,
  isDateOnly,
  isExpired,
  todayInIstanbul,
} from "../time";

describe("saat dilimi", () => {
  it("UTC zamanı İstanbul saatine çevirir", () => {
    expect(formatTime("2026-11-14T14:30:00Z")).toBe("17:30");
  });

  it("+00:00 ofsetini aynı şekilde işler", () => {
    expect(formatTime("2026-11-14T16:00:00+00:00")).toBe("19:00");
  });

  it("tarih ve saati Türkçe biçimler", () => {
    expect(formatDateTime("2026-11-14T14:30:00Z")).toContain("14 Kasım 2026");
  });

  it("geçersiz değerde boş döner", () => {
    expect(formatDateTime("bozuk")).toBe("");
  });

  it("bugünü İstanbul saatine göre bulur", () => {
    expect(todayInIstanbul(new Date("2026-11-14T21:30:00Z"))).toBe("2026-11-15");
    expect(todayInIstanbul(new Date("2026-11-14T20:59:00Z"))).toBe("2026-11-14");
  });
});

describe("DateOnly", () => {
  it("geçerliliği denetler", () => {
    expect(isDateOnly("2026-02-28")).toBe(true);
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(isDateOnly("2026-2-3")).toBe(false);
  });

  it("saat dilimi kaymadan biçimler", () => {
    expect(formatDateOnly("2026-11-14")).toBe("14 Kasım 2026");
    expect(formatDateOnly("bozuk")).toBe("");
  });

  it("gün ekler ve ay sınırını aşar", () => {
    expect(addDaysToDateOnly("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysToDateOnly("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("karşılaştırır", () => {
    expect(compareDateOnly("2026-01-01", "2026-01-02")).toBe(-1);
    expect(compareDateOnly("2026-01-02", "2026-01-02")).toBe(0);
    expect(compareDateOnly("2026-01-03", "2026-01-02")).toBe(1);
  });
});

describe("isExpired", () => {
  it("süresi geçmiş bağlantıyı yakalar", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    expect(isExpired("2026-11-14T09:59:59+00:00", now)).toBe(true);
    expect(isExpired("2026-11-14T10:30:00Z", now)).toBe(false);
  });
});
