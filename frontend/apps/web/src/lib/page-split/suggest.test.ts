import { describe, expect, it } from "vitest";
import { acceptSuggestions, confirmedBoxes, pendingBoxes, rejectSuggestions, suggestedBoxes, type SplitBox } from "./model";
import { clampRect } from "./geometry";
import { DRAFT_VERSION, loadDraft, peekDraft, saveDraft, type DraftStorage } from "./draft-store";
import { applyDetections, firstDetectedNumber } from "./suggest";
import type { PageDetection } from "./text-detect";

function memoryStorage(): DraftStorage {
  const map = new Map<string, string>();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key) };
}

function manual(id: string, page: number, y: number): SplitBox {
  return { id, page, rect: { x: 0.05, y, width: 0.4, height: 0.2 }, option: undefined, transferred: false };
}

function detection(page: number, numbers: number[], extra: Partial<PageDetection> = {}): PageDetection {
  return {
    page,
    confidence: "high",
    issues: [],
    boxes: numbers.map((number, index) => ({ number, sharedStem: false, rect: clampRect({ x: 0.05, y: 0.05 + index * 0.23, width: 0.4, height: 0.2 }) })),
    ...extra,
  };
}

describe("applyDetections", () => {
  it("öneri çerçevelerini source text ve suggested ile ekler", () => {
    const result = applyDetections([], [detection(0, [1, 2, 3])]);
    expect(result.added).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.boxes.every((box) => box.source === "text" && box.suggested === true && box.transferred === false)).toBe(true);
    expect(result.boxes.map((box) => box.detectedNumber)).toEqual([1, 2, 3]);
    expect(new Set(result.boxes.map((box) => box.id)).size).toBe(3);
  });

  it("mevcut çerçevelerle çakışan önerileri atlar", () => {
    const existing = [manual("m1", 0, 0.05)];
    const result = applyDetections(existing, [detection(0, [1, 2])]);
    expect(result.skipped).toBe(1);
    expect(result.added).toBe(1);
    expect(result.boxes.find((box) => box.id === "m1")).toBe(existing[0]);
  });

  it("farklı sayfadaki çerçeveyle çakışma saymaz", () => {
    const result = applyDetections([manual("m1", 1, 0.05)], [detection(0, [1])]);
    expect(result.skipped).toBe(0);
    expect(result.added).toBe(1);
  });

  it("aynı sayfada yeniden çalışınca eski önerileri yeniler, elle çerçevelere dokunmaz", () => {
    const first = applyDetections([manual("m1", 0, 0.8)], [detection(0, [1, 2])]);
    const second = applyDetections(first.boxes, [detection(0, [1, 2, 3])]);
    expect(suggestedBoxes(second.boxes)).toHaveLength(3);
    expect(confirmedBoxes(second.boxes).map((box) => box.id)).toEqual(["m1"]);
  });

  it("çalıştırılmayan sayfaların önerilerini korur", () => {
    const first = applyDetections([], [detection(0, [1]), detection(1, [2])]);
    const second = applyDetections(first.boxes, [detection(0, [1])]);
    expect(suggestedBoxes(second.boxes).filter((box) => box.page === 1)).toHaveLength(1);
  });

  it("kabul edilmiş önerilerle çakışan yeni önerileri atlar", () => {
    const first = applyDetections([], [detection(0, [1, 2])]);
    const accepted = acceptSuggestions(first.boxes);
    const second = applyDetections(accepted, [detection(0, [1, 2])]);
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(2);
    expect(confirmedBoxes(second.boxes)).toHaveLength(2);
  });

  it("öneri üretmeyen sayfa eski önerileri temizler", () => {
    const first = applyDetections([], [detection(0, [1])]);
    const second = applyDetections(first.boxes, [detection(0, [], { confidence: "none" })]);
    expect(second.boxes).toEqual([]);
  });

  it("ilk tespit edilen numarayı verir", () => {
    const result = applyDetections([], [detection(0, [9, 10]), detection(1, [11])]);
    expect(firstDetectedNumber(result.boxes)).toBe(9);
    expect(firstDetectedNumber([])).toBeNull();
  });
});

describe("öneri kabul, ret ve aktarım", () => {
  const boxes = applyDetections([manual("m1", 0, 0.8)], [detection(0, [1, 2])]).boxes;

  it("kabul işareti kaldırır ve source bilgisini korur", () => {
    const accepted = acceptSuggestions(boxes);
    expect(suggestedBoxes(accepted)).toHaveLength(0);
    expect(accepted.filter((box) => box.source === "text")).toHaveLength(2);
  });

  it("ret yalnız önerileri siler", () => {
    expect(rejectSuggestions(boxes).map((box) => box.id)).toEqual(["m1"]);
  });

  it("aktarım listesi yalnız kabul edilmiş çerçeveleri içerir", () => {
    expect(pendingBoxes(boxes).map((box) => box.id)).toEqual(["m1"]);
    expect(pendingBoxes(acceptSuggestions(boxes))).toHaveLength(3);
  });
});

describe("taslak deposu ve öneri durumu", () => {
  it("öneri durumunu yazıp geri okur", () => {
    const storage = memoryStorage();
    const boxes = applyDetections([manual("m1", 0, 0.8)], [detection(0, [4, 5])]).boxes;
    saveDraft(storage, "t", { version: DRAFT_VERSION, sourceKey: "pdf:x", savedAt: 1, pageCount: 2, boxes, rotations: {} });
    const loaded = loadDraft(storage, "t", "pdf:x", 2);
    const suggested = loaded?.boxes.filter((box) => box.suggested) ?? [];
    expect(suggested.map((box) => box.detectedNumber)).toEqual([4, 5]);
    expect(suggested.every((box) => box.source === "text")).toBe(true);
    expect(loaded?.boxes.find((box) => box.id === "m1")?.source).toBeUndefined();
  });

  it("kabul edilmiş öneriyi source text olarak ama suggested olmadan okur", () => {
    const storage = memoryStorage();
    const boxes = acceptSuggestions(applyDetections([], [detection(0, [1])]).boxes);
    saveDraft(storage, "t", { version: DRAFT_VERSION, sourceKey: "pdf:x", savedAt: 1, pageCount: 1, boxes, rotations: {} });
    const [loaded] = loadDraft(storage, "t", "pdf:x", 1)?.boxes ?? [];
    expect(loaded?.source).toBe("text");
    expect(loaded?.suggested).toBeUndefined();
  });

  it("eski (alanları olmayan) taslağı elle çizilmiş çerçeve olarak okur", () => {
    const storage = memoryStorage();
    storage.setItem("lgs.page-split.v1:t", JSON.stringify({ version: 1, sourceKey: "pdf:x", savedAt: 1, pageCount: 1, boxes: [{ id: "a", page: 0, rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 }, option: "B", transferred: false }], rotations: {} }));
    const loaded = loadDraft(storage, "t", "pdf:x", 1);
    expect(loaded?.boxes).toEqual([{ id: "a", page: 0, rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 }, option: "B", transferred: false }]);
  });

  it("bozuk öneri alanlarını güvenle yok sayar", () => {
    const storage = memoryStorage();
    storage.setItem("lgs.page-split.v1:t", JSON.stringify({ version: 1, sourceKey: "pdf:x", savedAt: 1, pageCount: 1, boxes: [{ id: "a", page: 0, rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 }, transferred: false, source: "text", suggested: "evet", detectedNumber: -4 }, { id: "b", page: 0, rect: { x: 0.1, y: 0.5, width: 0.3, height: 0.3 }, transferred: false, source: "ai", suggested: true, detectedNumber: 3 }], rotations: {} }));
    const [a, b] = loadDraft(storage, "t", "pdf:x", 1)?.boxes ?? [];
    expect(a?.suggested).toBeUndefined();
    expect(a?.detectedNumber).toBeUndefined();
    expect(b?.suggested).toBeUndefined();
    expect(b?.source).toBeUndefined();
  });

  it("bekleyen sayısı yalnız kabul edilmiş aktarılmamış çerçeveleri sayar", () => {
    const storage = memoryStorage();
    const boxes = applyDetections([manual("m1", 0, 0.8)], [detection(0, [1, 2])]).boxes;
    saveDraft(storage, "t", { version: DRAFT_VERSION, sourceKey: "pdf:x", savedAt: 1, pageCount: 1, boxes, rotations: {} });
    expect(peekDraft(storage, "t")).toEqual({ sourceKey: "pdf:x", pending: 1 });
  });
});
