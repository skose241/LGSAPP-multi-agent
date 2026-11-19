import { describe, expect, it } from "vitest";
import type { TopicPlanLesson } from "@lgs/api/queries";
import { highlightsMissing, nextWeekStart, parseTargetCount, parseWeekStart, planCellState, previousWeekStart, shortDateLabel, weekdayLabel, weekRange } from "./topic-plan";

const base: TopicPlanLesson = { lessonId: 1, lessonName: "Matematik", targetCount: 5, topic: null, plannedBy: null, usedAt: null, canEdit: true, rowVersion: null };

describe("konu planı hafta gezintisi", () => {
  it("hafta başlangıcını bugünle sınırlar", () => {
    expect(parseWeekStart(null, "2026-11-17")).toBe("2026-11-17");
    expect(parseWeekStart("2026-11-10", "2026-11-17")).toBe("2026-11-17");
    expect(parseWeekStart("bozuk", "2026-11-17")).toBe("2026-11-17");
    expect(parseWeekStart("2026-11-24", "2026-11-17")).toBe("2026-11-24");
    expect(parseWeekStart("2027-03-01", "2026-11-17")).toBe("2026-12-17");
  });

  it("yedi günlük aralık üretir", () => {
    expect(weekRange("2026-11-17")).toEqual({ from: "2026-11-17", to: "2026-11-23" });
  });

  it("önceki ve sonraki hafta sınırları", () => {
    expect(previousWeekStart("2026-11-17", "2026-11-17")).toBeNull();
    expect(previousWeekStart("2026-11-24", "2026-11-17")).toBe("2026-11-17");
    expect(previousWeekStart("2026-11-20", "2026-11-17")).toBe("2026-11-17");
    expect(nextWeekStart("2026-11-17", "2026-11-17")).toBe("2026-11-24");
    expect(nextWeekStart("2026-12-15", "2026-11-17")).toBeNull();
  });

  it("gün adını Türkçe yazar", () => {
    expect(weekdayLabel("2026-11-17")).toBe("Salı");
    expect(shortDateLabel("2026-11-17")).toBe("17 Kasım");
    expect(weekdayLabel("bozuk")).toBe("");
  });
});

describe("konu planı hücre durumu", () => {
  it("konu seçili ve düzenlenebilirse planlandı sayılır", () => {
    expect(planCellState({ ...base, topic: { id: 2, name: "Üslü" } })).toBe("planned");
    expect(planCellState({ ...base, topic: { id: 2, name: "Üslü" }, canEdit: false })).toBe("locked");
  });

  it("konusuz düzenlenebilir hücre eksik, üretimsiz hücre none olur", () => {
    expect(planCellState(base)).toBe("missing");
    expect(planCellState({ ...base, canEdit: false, targetCount: 0 })).toBe("none");
    expect(planCellState({ ...base, canEdit: false })).toBe("locked");
  });

  it("yalnızca yarının eksik dersi vurgulanır", () => {
    expect(highlightsMissing(base, "2026-11-18", "2026-11-18")).toBe(true);
    expect(highlightsMissing(base, "2026-11-19", "2026-11-18")).toBe(false);
    expect(highlightsMissing({ ...base, topic: { id: 2, name: "Üslü" } }, "2026-11-18", "2026-11-18")).toBe(false);
    expect(highlightsMissing({ ...base, targetCount: 0 }, "2026-11-18", "2026-11-18")).toBe(false);
  });

  it("hedef sayısı boş ya da sayı olabilir", () => {
    expect(parseTargetCount("")).toEqual({ ok: true, value: null });
    expect(parseTargetCount(" 12 ")).toEqual({ ok: true, value: 12 });
    expect(parseTargetCount("abc").ok).toBe(false);
    expect(parseTargetCount("-3").ok).toBe(false);
  });
});
