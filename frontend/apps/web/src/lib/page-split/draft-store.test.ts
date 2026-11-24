import { describe, expect, it } from "vitest";
import { DRAFT_MAX_BOXES, clearDraft, loadDraft, peekDraft, pdfSourceKey, photoSourceKey, saveDraft, type Draft, type DraftStorage } from "./draft-store";
import type { SplitBox } from "./model";

function memoryStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function box(id: string, page = 0, extra: Partial<SplitBox> = {}): SplitBox {
  return { id, page, rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 }, option: undefined, transferred: false, ...extra };
}

function draft(boxes: SplitBox[], overrides: Partial<Draft> = {}): Draft {
  return { version: 1, sourceKey: "pdf:abc", savedAt: 1, pageCount: 3, boxes, rotations: {}, ...overrides };
}

describe("draft-store", () => {
  it("kaydedip aynı kaynakta geri yükler", () => {
    const storage = memoryStorage();
    expect(saveDraft(storage, "pool", draft([box("a", 0, { option: "B" }), box("b", 2, { transferred: true })], { rotations: { 1: 90 } }))).toBe(true);
    const loaded = loadDraft(storage, "pool", "pdf:abc", 3);
    expect(loaded?.boxes.map((entry) => [entry.id, entry.option, entry.transferred])).toEqual([
      ["a", "B", false],
      ["b", undefined, true],
    ]);
    expect(loaded?.rotations).toEqual({ 1: 90 });
    expect(peekDraft(storage, "pool")).toEqual({ sourceKey: "pdf:abc", pending: 1 });
  });

  it("kaynak ya da sayfa sayısı farklıysa geri yüklemez", () => {
    const storage = memoryStorage();
    saveDraft(storage, "pool", draft([box("a")]));
    expect(loadDraft(storage, "pool", "pdf:baska", 3)).toBeNull();
    expect(loadDraft(storage, "pool", "pdf:abc", 4)).toBeNull();
    expect(loadDraft(storage, "assignment-1", "pdf:abc", 3)).toBeNull();
  });

  it("bozuk içerik ve geçersiz çerçeveleri eler", () => {
    const storage = memoryStorage();
    storage.setItem("lgs.page-split.v1:pool", "{bozuk");
    expect(loadDraft(storage, "pool", "pdf:abc", 3)).toBeNull();
    saveDraft(storage, "pool", draft([box("ok"), box("disarida", 9), box("tasan", 0, { rect: { x: 0.9, y: 0, width: 0.5, height: 0.2 } }), box("sahte-sik", 0, { option: "Z" })]));
    const loaded = loadDraft(storage, "pool", "pdf:abc", 3);
    expect(loaded?.boxes.map((entry) => entry.id)).toEqual(["ok", "sahte-sik"]);
    expect(loaded?.boxes[1]?.option).toBeUndefined();
  });

  it("sürüm uyuşmazlığında ve kutu sınırında yüklemez/kaydetmez", () => {
    const storage = memoryStorage();
    saveDraft(storage, "pool", draft([box("a")]));
    const key = [...storage.map.keys()][0]!;
    storage.map.set(key, storage.map.get(key)!.replace('"version":1', '"version":2'));
    expect(loadDraft(storage, "pool", "pdf:abc", 3)).toBeNull();
    const many = Array.from({ length: DRAFT_MAX_BOXES + 1 }, (_, index) => box(`b${index}`));
    expect(saveDraft(memoryStorage(), "pool", draft(many))).toBe(false);
  });

  it("çerçeve kalmayınca ve temizlenince kaydı siler", () => {
    const storage = memoryStorage();
    saveDraft(storage, "pool", draft([box("a")]));
    saveDraft(storage, "pool", draft([]));
    expect(storage.map.size).toBe(0);
    saveDraft(storage, "pool", draft([box("a")]));
    clearDraft(storage, "pool");
    expect(storage.map.size).toBe(0);
  });

  it("depolama hata verirse güvenle başarısız olur", () => {
    const failing: DraftStorage = {
      getItem: () => {
        throw new Error("kapalı");
      },
      setItem: () => {
        throw new Error("dolu");
      },
      removeItem: () => {
        throw new Error("kapalı");
      },
    };
    expect(saveDraft(failing, "pool", draft([box("a")]))).toBe(false);
    expect(loadDraft(failing, "pool", "pdf:abc", 3)).toBeNull();
    expect(peekDraft(failing, "pool")).toBeNull();
  });

  it("kaynak anahtarları kararlıdır ve dosya bilgisine bağlıdır", () => {
    expect(pdfSourceKey("f1")).toBe("pdf:f1");
    const files = [
      { name: "a.jpg", size: 10, lastModified: 5 },
      { name: "b.jpg", size: 20, lastModified: 6 },
    ];
    expect(photoSourceKey(files)).toBe(photoSourceKey([...files]));
    expect(photoSourceKey(files)).not.toBe(photoSourceKey([files[0]!, { ...files[1]!, size: 21 }]));
    expect(photoSourceKey(files)).not.toBe(photoSourceKey([files[1]!, files[0]!]));
  });
});
