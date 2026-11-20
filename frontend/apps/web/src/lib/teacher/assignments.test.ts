import { describe, expect, it } from "vitest";
import {
  assignmentFiltersToSearch,
  dayDiff,
  datesEditable,
  defaultAssignmentDates,
  findAddedByImage,
  formatPublishNote,
  moveId,
  parseAssignmentFilters,
  parseResultsView,
  participationOf,
  progressPercent,
  questionsEditable,
  remainingCapacity,
  remainingLabel,
  resultsViewToSearch,
  sortDirection,
  toggleSelection,
  assignmentDateLimit,
  bindServerFormProblem,
  validateAssignmentDates,
} from "./assignments";

describe("ödev yönetimi URL durumu", () => {
  it("varsayılan açık sekme boş sorgu üretir", () => {
    expect(assignmentFiltersToSearch({ tab: "open", mine: false, page: 1 })).toBe("");
    expect(parseAssignmentFilters(new URLSearchParams(""))).toEqual({ tab: "open", lessonId: undefined, mine: false, page: 1 });
  });

  it("sekme, ders, benim ve sayfayı gidiş dönüş korur", () => {
    const search = assignmentFiltersToSearch({ tab: "scheduled", lessonId: 4, mine: true, page: 3 });
    expect(search).toBe("?durum=planli&ders=4&benim=1&sayfa=3");
    expect(parseAssignmentFilters(new URLSearchParams(search))).toEqual({ tab: "scheduled", lessonId: 4, mine: true, page: 3 });
  });

  it("geçersiz değerleri varsayılana çevirir", () => {
    expect(parseAssignmentFilters(new URLSearchParams("durum=xx&ders=-2&sayfa=abc&benim=0"))).toEqual({ tab: "open", lessonId: undefined, mine: false, page: 1 });
  });
});

describe("tarih ve durum yardımcıları", () => {
  it("gün farkını hesaplar", () => {
    expect(dayDiff("2026-11-17", "2026-11-17")).toBe(0);
    expect(dayDiff("2026-11-17", "2026-11-20")).toBe(3);
    expect(dayDiff("2026-12-30", "2027-01-02")).toBe(3);
    expect(dayDiff("bozuk", "2026-11-17")).toBe(0);
  });

  it("kalan süre etiketi duruma göre değişir", () => {
    expect(remainingLabel("open", "2026-11-10", "2026-11-17", "2026-11-17")).toBe("Son Gün Bugün");
    expect(remainingLabel("open", "2026-11-10", "2026-11-18", "2026-11-17")).toBe("Son Gün Yarın");
    expect(remainingLabel("open", "2026-11-10", "2026-11-22", "2026-11-17")).toBe("5 Gün Kaldı");
    expect(remainingLabel("scheduled", "2026-11-18", "2026-11-22", "2026-11-17")).toBe("Yarın Başlar");
    expect(remainingLabel("scheduled", "2026-11-21", "2026-11-25", "2026-11-17")).toBe("4 Gün Sonra Başlar");
    expect(remainingLabel("closed", "2026-11-01", "2026-11-05", "2026-11-17")).toBe("Kapandı");
    expect(remainingLabel("draft", "2026-11-18", "2026-11-22", "2026-11-17")).toBe("Henüz Yayınlanmadı");
  });

  it("ilerleme yüzdesini sınırlar", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(3, 4)).toBe(75);
    expect(progressPercent(9, 4)).toBe(100);
  });

  it("varsayılan tarihler bugünden bir hafta sürer", () => {
    expect(defaultAssignmentDates("2026-11-17")).toEqual({ startDate: "2026-11-17", endDate: "2026-11-23" });
  });

  it("tarih doğrulaması bitişin başlangıçtan önce olmasını yakalar", () => {
    expect(validateAssignmentDates({ startDate: "2026-11-17", endDate: "2026-11-20" })).toEqual({});
    expect(validateAssignmentDates({ startDate: "2026-11-17", endDate: "2026-11-16" }).endDate).toMatch(/önce olamaz/);
    expect(validateAssignmentDates({ startDate: "", endDate: "" })).toEqual({ startDate: "Başlangıç tarihini seçin.", endDate: "Bitiş tarihini seçin." });
  });

  it("tarih doğrulaması backend sınırlarını bilir", () => {
    const today = "2026-11-17";
    expect(validateAssignmentDates({ startDate: "2026-11-16", endDate: "2026-11-20" }, { today }).startDate).toMatch(/bugünden önce/);
    expect(validateAssignmentDates({ startDate: "2026-11-16", endDate: "2026-11-20" }, { today, allowPastStart: true })).toEqual({});
    expect(validateAssignmentDates({ startDate: "2026-11-17", endDate: "2027-01-15" }, { today })).toEqual({});
    expect(validateAssignmentDates({ startDate: "2026-11-17", endDate: "2027-01-16" }, { today }).endDate).toBe("Ödev süresi en fazla 60 gün olabilir.");
    expect(validateAssignmentDates({ startDate: "2027-11-10", endDate: "2027-11-17" }, { today })).toEqual({});
    expect(validateAssignmentDates({ startDate: "2027-11-18", endDate: "2027-11-19" }, { today }).startDate).toMatch(/1 yıl/);
    expect(validateAssignmentDates({ startDate: "2027-11-10", endDate: "2027-11-18" }, { today }).endDate).toMatch(/1 yıl/);
  });

  it("bir yıl sınırı artık yılı .NET gibi hesaplar", () => {
    expect(assignmentDateLimit("2026-11-17")).toBe("2027-11-17");
    expect(assignmentDateLimit("2028-02-29")).toBe("2029-02-28");
  });

  it("sunucunun mesajını ilgili alana bağlar", () => {
    const values = { startDate: "2026-11-17", endDate: "2026-11-20" };
    const problem = (message: string) => ({ message, fieldErrors: {} });
    expect(bindServerFormProblem(problem("Başlangıç tarihi bugünden önce olamaz."), values, "2026-11-17")).toEqual({ startDate: "Başlangıç tarihi bugünden önce olamaz." });
    expect(bindServerFormProblem(problem("Ödev süresi en fazla 60 gün olabilir."), values, "2026-11-17")).toEqual({ endDate: "Ödev süresi en fazla 60 gün olabilir." });
    expect(bindServerFormProblem(problem("Başlık en fazla 150 karakter olabilir."), values, "2026-11-17")).toEqual({ title: "Başlık en fazla 150 karakter olabilir." });
    expect(bindServerFormProblem(problem("Ödev tarihleri bugünden en fazla 1 yıl sonrası olabilir."), { startDate: "2028-01-01", endDate: "2028-01-02" }, "2026-11-17")?.startDate).toBeDefined();
    expect(bindServerFormProblem(problem("Başka bir hata."), values, "2026-11-17")).toBeNull();
  });

  it("düzenleme yetkisi duruma göre belirlenir", () => {
    expect(questionsEditable(true, "draft")).toBe(true);
    expect(questionsEditable(true, "scheduled")).toBe(true);
    expect(questionsEditable(true, "open")).toBe(false);
    expect(questionsEditable(false, "draft")).toBe(false);
    expect(datesEditable(true, "draft")).toEqual({ start: true, end: true });
    expect(datesEditable(true, "open")).toEqual({ start: false, end: true });
    expect(datesEditable(true, "closed")).toEqual({ start: false, end: false });
    expect(datesEditable(false, "draft")).toEqual({ start: false, end: false });
  });

  it("yayın bildirimi duruma göre yazılır", () => {
    expect(formatPublishNote({ state: "open", notifiedCount: 3 })).toContain("3 öğrenciye");
    expect(formatPublishNote({ state: "open", notifiedCount: 0 })).toBe("Ödev yayınlandı.");
    expect(formatPublishNote({ state: "scheduled" })).toContain("planlandı");
  });
});

describe("soru sıralama", () => {
  it("yukarı ve aşağı taşır", () => {
    expect(moveId([1, 2, 3, 4], 3, "up")).toEqual([1, 3, 2, 4]);
    expect(moveId([1, 2, 3, 4], 2, "down")).toEqual([1, 3, 2, 4]);
  });

  it("uçlarda ve bilinmeyen kimlikte null döner", () => {
    expect(moveId([1, 2, 3], 1, "up")).toBeNull();
    expect(moveId([1, 2, 3], 3, "down")).toBeNull();
    expect(moveId([1, 2, 3], 9, "up")).toBeNull();
  });

  it("girdiyi değiştirmez", () => {
    const ids = [1, 2, 3];
    moveId(ids, 2, "up");
    expect(ids).toEqual([1, 2, 3]);
  });
});

describe("katılım", () => {
  it("backend sınıflandırmasıyla uyumludur", () => {
    expect(participationOf(0, 0, "open")).toBe("empty");
    expect(participationOf(5, 5, "open")).toBe("completed");
    expect(participationOf(2, 5, "open")).toBe("partial");
    expect(participationOf(2, 5, "closed")).toBe("partial");
    expect(participationOf(0, 5, "open")).toBe("notStarted");
    expect(participationOf(0, 5, "closed")).toBe("missed");
  });
});

describe("sonuç görünümü", () => {
  it("varsayılan katılım sıralaması boş sorgu üretir", () => {
    expect(resultsViewToSearch({ sort: "completion", page: 1 })).toBe("");
    expect(parseResultsView(new URLSearchParams(""))).toEqual({ sort: "completion", page: 1 });
  });

  it("sıralama ve sayfayı gidiş dönüş korur", () => {
    const search = resultsViewToSearch({ sort: "correct", page: 2 });
    expect(search).toBe("?sirala=dogru&sayfa=2");
    expect(parseResultsView(new URLSearchParams(search))).toEqual({ sort: "correct", page: 2 });
  });

  it("ad sıralaması artan, diğerleri azalan gider", () => {
    expect(sortDirection("name")).toBe("asc");
    expect(sortDirection("completion")).toBe("desc");
  });
});

describe("toplu ekleme yardımcıları", () => {
  it("fotoğrafa göre mevcut soruyu bulur", () => {
    const questions = [
      { id: 1, imageFileId: 10 },
      { id: 2, imageFileId: null },
      { id: 3, imageFileId: 12 },
    ];
    expect(findAddedByImage(questions, 12)?.id).toBe(3);
    expect(findAddedByImage(questions, 99)).toBeUndefined();
  });

  it("kapasite ve seçim sınırı", () => {
    expect(remainingCapacity(150)).toBe(50);
    expect(remainingCapacity(250)).toBe(0);
    expect(toggleSelection([1, 2], 3, 5)).toEqual([1, 2, 3]);
    expect(toggleSelection([1, 2, 3], 2, 5)).toEqual([1, 3]);
    expect(toggleSelection([1, 2], 3, 2)).toEqual([1, 2]);
  });
});
