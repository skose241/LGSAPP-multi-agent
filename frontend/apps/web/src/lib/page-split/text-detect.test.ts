import { describe, expect, it } from "vitest";
import { column, frag, furniture, question } from "./text-test-utils";
import { badgeFor, detectDocument, parseLine } from "./text-detect";

function numbers(page: ReturnType<typeof detectDocument>[number]): number[] {
  return page.boxes.map((box) => box.number);
}

describe("parseLine", () => {
  it("numara biçimlerini tanır", () => {
    expect(parseLine("5. Aşağıdakilerden").number).toBe(5);
    expect(parseLine("12) Bir işçi").number).toBe(12);
    expect(parseLine("7- Bir cisim").number).toBe(7);
    expect(parseLine("7 – Bir cisim").number).toBe(7);
    expect(parseLine("3.").number).toBe(3);
    expect(parseLine("Soru 5").number).toBe(5);
    expect(parseLine("SORU 12:").number).toBe(12);
  });

  it("şık etiketlerini, ondalıkları ve rastgele metni numara saymaz", () => {
    expect(parseLine("A) 12").number).toBeNull();
    expect(parseLine("E) 9").number).toBeNull();
    expect(parseLine("3.5 santimetre").number).toBeNull();
    expect(parseLine("2025 LGS").number).toBeNull();
    expect(parseLine("0. başlangıç").number).toBeNull();
    expect(parseLine("Aşağıdaki 5. sorudan").number).toBeNull();
  });

  it("aralık ifadelerini numara saymaz ve başlangıcını verir", () => {
    const range = parseLine("1-3. soruları aşağıdaki metne göre cevaplayınız.");
    expect(range.number).toBeNull();
    expect(range.rangeStart).toBe(1);
    expect(parseLine("4 – 6. soruları cevaplayınız").number).toBeNull();
    expect(parseLine("Bu parçaya göre 7-9. soruları yanıtlayınız.").rangeStart).toBe(7);
    expect(parseLine("5 ve 6. soruları yanıtlayınız.").rangeStart).toBe(5);
    expect(parseLine("2-3 gün sürer").number).toBeNull();
  });
});

describe("tek sütunlu sayfa", () => {
  const fragments = column(0.08, [1, 2, 3, 4, 5], 0.1, 0.17);
  const [page] = detectDocument([fragments]);

  it("her numara için bir çerçeve önerir", () => {
    expect(page?.confidence).toBe("high");
    expect(page?.issues).toEqual([]);
    expect(page && numbers(page)).toEqual([1, 2, 3, 4, 5]);
  });

  it("çerçeveler numaradan sonraki numaraya uzanır, son soru sayfa sonuna kadar gider", () => {
    const boxes = page?.boxes ?? [];
    expect(boxes[0]?.rect.y).toBeCloseTo(0.1 - 0.004, 3);
    for (let index = 0; index < boxes.length - 1; index += 1) {
      const current = boxes[index]!.rect;
      const next = boxes[index + 1]!.rect;
      expect(current.y + current.height).toBeLessThan(next.y);
      expect(next.y - (current.y + current.height)).toBeLessThan(0.01);
    }
    const last = boxes[4]!.rect;
    expect(last.y + last.height).toBeGreaterThan(0.95);
    expect(last.y + last.height).toBeLessThanOrEqual(1);
  });

  it("kenar payı bırakır ve sayfa içinde kalır", () => {
    for (const box of page?.boxes ?? []) {
      expect(box.rect.x).toBeLessThan(0.08);
      expect(box.rect.x).toBeGreaterThanOrEqual(0.01);
      expect(box.rect.x + box.rect.width).toBeLessThanOrEqual(0.99);
      expect(box.rect.width).toBeGreaterThan(0.7);
    }
  });
});

describe("LGS tipi iki sütunlu sayfa", () => {
  const fragments = [...column(0.06, [1, 2, 3, 4], 0.1, 0.2), ...column(0.53, [5, 6, 7, 8], 0.1, 0.2)];
  const [page] = detectDocument([fragments]);

  it("sütunları ayırır ve 8 çerçeve üretir", () => {
    expect(page?.confidence).toBe("high");
    expect(page && numbers(page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const left = page?.boxes.filter((box) => box.number <= 4) ?? [];
    const right = page?.boxes.filter((box) => box.number > 4) ?? [];
    for (const box of left) expect(box.rect.x + box.rect.width).toBeLessThan(0.53);
    for (const box of right) expect(box.rect.x).toBeGreaterThan(0.5);
  });

  it("sütunlar arasında örtüşme olmaz", () => {
    const boxes = page?.boxes ?? [];
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue;
        const overlapX = Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width) - Math.max(a.rect.x, b.rect.x);
        const overlapY = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y);
        expect(overlapX > 0 && overlapY > 0).toBe(false);
      }
    }
  });

  it("sağ sütun çerçevesi sol sütun metnine, sol sütun çerçevesi sağ sütun metnine taşmaz", () => {
    const longLeft = frag(0.2, 0.132, "x".repeat(38));
    const earlyRight = frag(0.505, 0.308, "y".repeat(10));
    expect(longLeft.x + longLeft.w).toBeGreaterThan(0.53 - 0.015);
    const [wide] = detectDocument([[...fragments, longLeft, earlyRight]]);
    expect(wide && numbers(wide)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const box of wide?.boxes ?? []) {
      const rect = box.rect;
      for (const fragment of [longLeft, earlyRight]) {
        const overlapY = Math.min(rect.y + rect.height, fragment.y + fragment.h) - Math.max(rect.y, fragment.y);
        if (overlapY <= 0) continue;
        const crosses = (edge: number) => fragment.x < edge && edge < fragment.x + fragment.w;
        expect(crosses(rect.x) || crosses(rect.x + rect.width)).toBe(false);
      }
    }
    const fifth = wide?.boxes.find((box) => box.number === 5);
    const second = wide?.boxes.find((box) => box.number === 2);
    expect(fifth!.rect.x).toBeGreaterThanOrEqual(longLeft.x + longLeft.w);
    expect(second!.rect.x + second!.rect.width).toBeLessThanOrEqual(0.505);
  });

  it("yalnız tek soru kalan sütunu da çerçeveler", () => {
    const [short] = detectDocument([[...column(0.06, [1, 2, 3, 4, 5, 6], 0.1, 0.14), ...column(0.53, [7], 0.1, 0.14)]]);
    expect(short && numbers(short)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("Soru N biçimi", () => {
  it("etiketli numaraları da çerçeveler", () => {
    const fragments = column(0.07, [1, 2, 3], 0.1, 0.25, (value) => `Soru ${value}`);
    const [page] = detectDocument([fragments]);
    expect(page && numbers(page)).toEqual([1, 2, 3]);
    expect(page?.confidence).toBe("high");
  });
});

describe("ortak metin", () => {
  const stem = [frag(0.06, 0.1, "1-3. soruları aşağıdaki metne göre cevaplayınız."), frag(0.06, 0.125, "Metin satırı bir."), frag(0.06, 0.145, "Metin satırı iki.")];
  const fragments = [...stem, ...question({ x: 0.06, y: 0.2, number: 1 }), ...question({ x: 0.06, y: 0.4, number: 2 }), ...question({ x: 0.06, y: 0.6, number: 3 }), ...question({ x: 0.06, y: 0.8, number: 4 })];
  const [page] = detectDocument([fragments]);

  it("aralık satırını numara saymaz", () => {
    expect(page && numbers(page)).toEqual([1, 2, 3, 4]);
    expect(page?.confidence).toBe("high");
  });

  it("ortak metni ilk sorunun çerçevesine dahil eder", () => {
    const first = page?.boxes[0];
    expect(first?.sharedStem).toBe(true);
    expect(first?.rect.y).toBeCloseTo(0.1 - 0.004, 3);
    expect(page?.boxes.slice(1).every((box) => !box.sharedStem)).toBe(true);
  });
});

describe("numara dizisi kontrolü", () => {
  it("eksik numarayı bildirir ve düşük güven verir", () => {
    const [page] = detectDocument([column(0.08, [1, 2, 4, 5], 0.1, 0.2)]);
    expect(page?.confidence).toBe("low");
    expect(page?.issues.map((issue) => issue.code)).toEqual(["gap"]);
    expect(page?.issues[0]?.message).toContain("3");
    expect(page && badgeFor(page)).toBe("Numara Sırası Eksik");
    expect(page && numbers(page)).toEqual([1, 2, 4, 5]);
  });

  it("aralıklı eksikleri aralık olarak yazar", () => {
    const [page] = detectDocument([column(0.08, [1, 5], 0.1, 0.4)]);
    expect(page?.issues[0]?.message).toContain("2–4");
  });

  it("tekrar eden numarayı çerçeve yapmaz ve bildirir", () => {
    const fragments = [...column(0.08, [1, 2, 3], 0.1, 0.2), ...question({ x: 0.08, y: 0.75, number: 2, options: false })];
    const [page] = detectDocument([fragments]);
    expect(page && numbers(page)).toEqual([1, 2, 3]);
    expect(page?.issues.map((issue) => issue.code)).toContain("repeat");
    expect(page?.confidence).toBe("low");
    expect(page && badgeFor(page)).toBe("Numara Tekrarı");
  });

  it("geri giden numarayı çerçeve yapmaz ve bildirir", () => {
    const fragments = [...column(0.08, [4, 5, 6], 0.1, 0.2), ...question({ x: 0.08, y: 0.75, number: 2, options: false })];
    const [page] = detectDocument([fragments]);
    expect(page && numbers(page)).toEqual([4, 5, 6]);
    expect(page?.issues.map((issue) => issue.code)).toContain("backward");
  });

  it("sayfalar arası sıra bozulursa düşük güven verir", () => {
    const pages = [column(0.08, [1, 2, 3, 4], 0.1, 0.2), column(0.08, [6, 7, 8, 9], 0.1, 0.2)];
    const [first, second] = detectDocument(pages);
    expect(first?.confidence).toBe("high");
    expect(second?.confidence).toBe("low");
    expect(second?.issues.map((issue) => issue.code)).toContain("continuity");
    expect(second && badgeFor(second)).toBe("Sayfa Sırası Uyumsuz");
  });

  it("sayfalar arası sıra düzgünse yüksek güven verir", () => {
    const pages = [column(0.08, [1, 2, 3, 4], 0.1, 0.2), column(0.08, [5, 6, 7, 8], 0.1, 0.2)];
    expect(detectDocument(pages).map((page) => page.confidence)).toEqual(["high", "high"]);
  });

  it("soru içindeki girintili numaralı listeyi soru sanmaz", () => {
    const inner = [frag(0.12, 0.33, "1. Birinci önerme"), frag(0.12, 0.35, "2. İkinci önerme"), frag(0.12, 0.37, "3. Üçüncü önerme")];
    const [page] = detectDocument([[...column(0.06, [1, 2, 3, 4, 5], 0.1, 0.17), ...inner]]);
    expect(page && numbers(page)).toEqual([1, 2, 3, 4, 5]);
    expect(page?.confidence).toBe("high");
  });
});

describe("üst ve alt bilgi", () => {
  const pages = [
    [...furniture(0, 2), ...column(0.08, [1, 2, 3, 4], 0.1, 0.2)],
    [...furniture(1, 2), ...column(0.08, [5, 6, 7, 8], 0.1, 0.2)],
  ];
  const results = detectDocument(pages);

  it("tekrarlanan üst bilgiyi numara saymaz", () => {
    expect(results.map(numbers)).toEqual([[1, 2, 3, 4], [5, 6, 7, 8]]);
    expect(results.map((page) => page.confidence)).toEqual(["high", "high"]);
  });

  it("son sorunun çerçevesi alt bilgiyi içermez", () => {
    for (const page of results) {
      const last = page.boxes[page.boxes.length - 1]!.rect;
      expect(last.y + last.height).toBeLessThan(0.96);
    }
  });

  it("tek sayfada bilinen alt bilgi kalıplarını atar", () => {
    const [page] = detectDocument([[...column(0.08, [1, 2, 3], 0.1, 0.25), frag(0.4, 0.97, "Diğer sayfaya geçiniz.")]]);
    const last = page!.boxes[2]!.rect;
    expect(last.y + last.height).toBeLessThan(0.97);
  });

  it("her sayfada farklı numaralı soruları üst bilgi saymaz", () => {
    const first = [...column(0.08, [1, 2, 3, 4], 0.06, 0.22)];
    const second = [...column(0.08, [5, 6, 7, 8], 0.06, 0.22)];
    const [a, b] = detectDocument([first, second]);
    expect(a && numbers(a)).toEqual([1, 2, 3, 4]);
    expect(b && numbers(b)).toEqual([5, 6, 7, 8]);
  });
});

describe("sayfaya taşan soru", () => {
  const carried = [frag(0.08, 0.12, "önceki sayfadan gelen soru metninin devamı"), frag(0.08, 0.14, "ve şıkların kalanı burada devam ediyor")];
  const pages = [[frag(0.2, 0.04, "2025 LGS Fen Bilimleri Deneme"), ...column(0.08, [1, 2, 3], 0.15, 0.25)], [...carried, ...column(0.08, [4, 5, 6], 0.2, 0.25)]];
  const [first, second] = detectDocument(pages);

  it("ilk sayfadaki başlık metnini taşma saymaz", () => {
    expect(first?.confidence).toBe("high");
  });

  it("sonraki sayfa başındaki devam metnini bildirir", () => {
    expect(second && numbers(second)).toEqual([4, 5, 6]);
    expect(second?.issues.map((issue) => issue.code)).toContain("overflow");
    expect(second?.confidence).toBe("low");
    expect(second?.boxes[0]?.rect.y).toBeGreaterThan(0.18);
  });
});

describe("metin olmayan sayfalar", () => {
  it("metin yoksa noText verir", () => {
    const [page] = detectDocument([[]]);
    expect(page?.confidence).toBe("none");
    expect(page?.issues.map((issue) => issue.code)).toEqual(["noText"]);
    expect(page?.boxes).toEqual([]);
  });

  it("numarasız metin için noNumbers verir", () => {
    const [page] = detectDocument([[frag(0.1, 0.2, "Bu sayfada yalnızca bir şekil açıklaması vardır.")]]);
    expect(page?.confidence).toBe("none");
    expect(page?.issues.map((issue) => issue.code)).toEqual(["noNumbers"]);
    expect(page && badgeFor(page)).toBe("Numara Bulunamadı");
  });

  it("cevap anahtarı sayfasını atlar", () => {
    const pages = [column(0.08, [1, 2], 0.1, 0.3), [frag(0.1, 0.05, "CEVAP ANAHTARI"), frag(0.1, 0.1, "1. A")]];
    const results = detectDocument(pages, { answerKeyFrom: [null, 0.05] });
    expect(results[1]?.skipped).toBe("answerKey");
    expect(results[1]?.boxes).toEqual([]);
    expect(results[1] && badgeFor(results[1])).toBeNull();
    expect(results[0] && numbers(results[0])).toEqual([1, 2]);
  });

  it("sayfanın altındaki cevap anahtarını soru bölgesi dışında tutar", () => {
    const fragments = [...column(0.08, [1, 2], 0.1, 0.25), frag(0.1, 0.7, "CEVAP ANAHTARI"), frag(0.1, 0.75, "1. A"), frag(0.1, 0.77, "2. C")];
    const [page] = detectDocument([fragments], { answerKeyFrom: [0.7] });
    expect(page && numbers(page)).toEqual([1, 2]);
    const last = page!.boxes[1]!.rect;
    expect(last.y + last.height).toBeLessThanOrEqual(0.7);
  });
});

describe("dayanıklılık", () => {
  it("boş sayfa listesinde hata vermez", () => {
    expect(detectDocument([])).toEqual([]);
  });

  it("sıfır boyutlu parçaları yok sayar", () => {
    const [page] = detectDocument([[{ str: "1.", x: 0.1, y: 0.1, w: 0, h: 0, fontSize: 0 }]]);
    expect(page?.confidence).toBe("none");
  });

  it("numarayı ayrı parça, metni ayrı parça olarak veren PDF'lerde de çalışır", () => {
    const fragments = [frag(0.08, 0.1, "1"), frag(0.1, 0.1, "."), frag(0.13, 0.1, "Soru gövdesi"), frag(0.08, 0.5, "2."), frag(0.12, 0.5, "Soru gövdesi")];
    const [page] = detectDocument([fragments]);
    expect(page && numbers(page)).toEqual([1, 2]);
  });
});
