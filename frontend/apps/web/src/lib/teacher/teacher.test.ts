import { describe, expect, it } from "vitest";
import type { TopicPlanRange } from "@lgs/api/queries";
import { unplannedLessons } from "./dashboard";
import { isNoBranch, solutionHref, thresholdSentence, wrongRateLabel } from "./needs-solution";
import { parseReportFilters, reportFiltersToSearch, resolveChoices } from "./reports";
import { teacherSolutionState } from "./solution";
import { lastValidPage, pageSlice, parseStudentFilters, percentLabel, studentFiltersToSearch } from "./students";

describe("öğrenci listesi URL durumu", () => {
  it("varsayılanlar boş sorgu üretir", () => {
    expect(studentFiltersToSearch({ search: "", sort: "name", page: 1 })).toBe("");
    expect(parseStudentFilters(new URLSearchParams(""))).toEqual({ search: "", sort: "name", page: 1 });
  });

  it("arama, sıralama ve sayfayı gidiş dönüş korur", () => {
    const search = studentFiltersToSearch({ search: " Ayşe ", sort: "points", page: 3 });
    expect(search).toBe("?ara=Ay%C5%9Fe&sirala=puan&sayfa=3");
    expect(parseStudentFilters(new URLSearchParams(search))).toEqual({ search: "Ayşe", sort: "points", page: 3 });
  });

  it("geçersiz değerleri varsayılana çevirir", () => {
    expect(parseStudentFilters(new URLSearchParams("sirala=xx&sayfa=-4"))).toEqual({ search: "", sort: "name", page: 1 });
    expect(parseStudentFilters(new URLSearchParams("sayfa=abc")).page).toBe(1);
  });

  it("aramayı 60 karakterle sınırlar", () => {
    expect(parseStudentFilters(new URLSearchParams(`ara=${"a".repeat(100)}`)).search).toHaveLength(60);
  });
});

describe("biçim yardımcıları", () => {
  it("başarı yüzdesini yuvarlar, boşta tire döner", () => {
    expect(percentLabel(66.6)).toBe("%67");
    expect(percentLabel(null)).toBe("-");
    expect(percentLabel(0)).toBe("%0");
  });

  it("sayfa dilimini hesaplar", () => {
    expect(pageSlice(2, 20, 45, 20)).toEqual({ page: 2, pageCount: 3, from: 21, to: 40, total: 45 });
    expect(pageSlice(1, 20, 0, 0)).toEqual({ page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });
});

describe("çözüm bekleyenler", () => {
  it("eşik cümlesini yanıttan kurar", () => {
    expect(thresholdSentence(5, 60)).toBe("En az 5 öğrencinin çözdüğü ve yanlış oranı %60 ve üzeri olan sorular");
    expect(wrongRateLabel(66.67)).toBe("%67");
  });

  it("branşsız öğretmeni tanır", () => {
    expect(isNoBranch("ogretmen", null)).toBe(true);
    expect(isNoBranch("ogretmen", undefined)).toBe(true);
    expect(isNoBranch("ogretmen", 3)).toBe(false);
    expect(isNoBranch("mudur", null)).toBe(false);
  });

  it("çözüm ekleme bağlantısı formu açık getirir", () => {
    expect(solutionHref(42)).toBe("/sorular/42?cozum=ogretmen");
  });
});

describe("öğretmen çözümü doğrulaması", () => {
  it("metin veya fotoğraf ister, üst sınırı uygular", () => {
    expect(teacherSolutionState({ length: 0, max: 2000, hasPhoto: false }).valid).toBe(false);
    expect(teacherSolutionState({ length: 5, max: 2000, hasPhoto: false }).valid).toBe(true);
    expect(teacherSolutionState({ length: 0, max: 2000, hasPhoto: true }).valid).toBe(true);
    expect(teacherSolutionState({ length: 2001, max: 2000, hasPhoto: true })).toMatchObject({ valid: false, tooLong: true });
  });
});

describe("şikâyet filtreleri ve kararları", () => {
  it("varsayılan durum bekleyen, sorguda görünmez", () => {
    expect(parseReportFilters(new URLSearchParams(""))).toEqual({ status: "pending", targetType: "all", page: 1 });
    expect(reportFiltersToSearch({ status: "pending", targetType: "all", page: 1 })).toBe("");
  });

  it("filtreleri gidiş dönüş korur", () => {
    const search = reportFiltersToSearch({ status: "all", targetType: "solution", page: 2 });
    expect(search).toBe("?durum=all&tur=solution&sayfa=2");
    expect(parseReportFilters(new URLSearchParams(search))).toEqual({ status: "all", targetType: "solution", page: 2 });
  });

  it("karar seçeneklerini hedefe ve role göre verir", () => {
    const values = (input: { targetType: string; isMudur: boolean }) => resolveChoices(input).map((choice) => choice.value);
    expect(values({ targetType: "comment", isMudur: false })).toEqual(["reject", "hideContent"]);
    expect(values({ targetType: "question", isMudur: false })).toEqual(["reject", "hideContent", "changeAnswerKey"]);
    expect(values({ targetType: "question", isMudur: true })).toEqual(["reject", "hideContent", "changeAnswerKey", "banUser"]);
  });
});

describe("pano konu planı", () => {
  it("konusu seçilmemiş ve hedefi olan dersleri bulur", () => {
    const range = {
      days: [
        {
          date: "2026-11-18",
          isoDayOfWeek: 3,
          lessons: [
            { lessonId: 1, lessonName: "Matematik", targetCount: 5, topic: null, plannedBy: null, usedAt: null, canEdit: true, rowVersion: null },
            { lessonId: 2, lessonName: "Fen", targetCount: 5, topic: { id: 9, name: "Hücre" }, plannedBy: null, usedAt: null, canEdit: true, rowVersion: null },
            { lessonId: 3, lessonName: "Tarih", targetCount: 0, topic: null, plannedBy: null, usedAt: null, canEdit: false, rowVersion: null },
          ],
        },
      ],
    } as TopicPlanRange;
    expect(unplannedLessons(range)).toEqual([{ lessonId: 1, lessonName: "Matematik" }]);
  });
});

describe('aralık dışı sayfa', () => {
  it('boş sayfada son geçerli sayfayı verir', () => {
    expect(lastValidPage(3, 12, 13, 0)).toBe(2);
    expect(lastValidPage(2, 20, 20, 0)).toBe(1);
  });

  it('gerekmiyorsa null döner', () => {
    expect(lastValidPage(1, 12, 0, 0)).toBeNull();
    expect(lastValidPage(2, 12, 30, 5)).toBeNull();
    expect(lastValidPage(3, 12, 0, 0)).toBeNull();
  });
});
