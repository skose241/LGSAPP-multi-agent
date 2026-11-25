import { describe, expect, it } from "vitest";
import { detectAnswerKeyPage, detectAnswerKeys, isKeyHeading } from "./answer-key-detect";
import { applyAnswers, boxNumber, numberFor, numberingOf, type SplitBox } from "./model";
import { bestChain, detectDocument, parseLine } from "./text-detect";
import { column, frag, question } from "./text-test-utils";

function numbersOf(page: ReturnType<typeof detectDocument>[number] | undefined): number[] {
  return page?.boxes.map((box) => box.number) ?? [];
}

describe("numara zinciri (O1)", () => {
  it("sarılmış satırdaki '18. yüzyılda' ifadesini soru sanmaz", () => {
    const fragments = [...column(0.08, [1, 2, 3, 4, 5], 0.1, 0.17), frag(0.08, 0.5 + 0.02, "18. yüzyılda yaşanan olaylar arasında")];
    const [page] = detectDocument([fragments]);
    expect(numbersOf(page)).toEqual([1, 2, 3, 4, 5]);
    expect(page?.confidence).toBe("high");
  });

  it("gövdedeki 'x - y' ifadesini numara saymaz", () => {
    expect(parseLine("9 - x = 5").number).toBeNull();
    expect(parseLine("9 - 5 = 4").number).toBeNull();
    expect(parseLine("7- Bir cisim").number).toBe(7);
    expect(parseLine("7 – Bir cisim").number).toBe(7);
    expect(parseLine("7-").number).toBe(7);
    const fragments = [...column(0.08, [1, 2, 3], 0.1, 0.25), frag(0.08, 0.3, "9 - x = 5 denkleminin çözümü")];
    const [page] = detectDocument([fragments]);
    expect(numbersOf(page)).toEqual([1, 2, 3]);
    expect(page?.confidence).toBe("high");
  });

  it("en uzun ardışık diziyi tutar", () => {
    const chain = bestChain([1, 2, 3, 18, 4, 5].map((number) => ({ number, offset: 0 })));
    expect([...chain].sort((a, b) => a - b)).toEqual([0, 1, 2, 4, 5]);
  });

  it("zincir dışı yan satırlar sessizce atılır, kenardaki tekrar uyarı verir", () => {
    const margin = [...column(0.08, [1, 2, 3], 0.1, 0.25), ...question({ x: 0.08, y: 0.8, number: 2, options: false })];
    expect(detectDocument([margin])[0]?.issues.map((issue) => issue.code)).toContain("repeat");
  });
});

describe("girintili liste (O2)", () => {
  it("numaradan az girintili 1-2-3-4 listesini soru yapmaz", () => {
    const inner = [frag(0.1, 0.33, "1. Birinci önerme"), frag(0.1, 0.35, "2. İkinci önerme"), frag(0.1, 0.37, "3. Üçüncü önerme"), frag(0.1, 0.39, "4. Dördüncü önerme")];
    const [page] = detectDocument([[...column(0.08, [1, 2, 3, 4, 5], 0.1, 0.17), ...inner]]);
    expect(numbersOf(page)).toEqual([1, 2, 3, 4, 5]);
    expect(page?.confidence).toBe("high");
  });

  it("aynı kenardaki gerçek tekrar yine bildirilir", () => {
    const [page] = detectDocument([[...column(0.08, [1, 2, 3], 0.1, 0.2), frag(0.08, 0.75, "2. başka bir satır")]]);
    expect(page?.issues.map((issue) => issue.code)).toContain("repeat");
  });
});

describe("aralık başlangıcı (D1)", () => {
  it("liste biçimli aralıkta ilk numarayı verir", () => {
    expect(parseLine("5, 6 ve 7. soruları aşağıdaki metne göre cevaplayınız.").rangeStart).toBe(5);
    expect(parseLine("5 ve 6. soruları yanıtlayınız.").rangeStart).toBe(5);
    expect(parseLine("1-3. soruları yanıtlayınız.").rangeStart).toBe(1);
  });
});

describe("cevap anahtarı yanlış pozitifleri (O3)", () => {
  it("cümle içindeki 'cevap anahtarı' ifadesini başlık saymaz", () => {
    expect(isKeyHeading("Cevap anahtarı son sayfadadır.")).toBe(false);
    expect(isKeyHeading("Cevap anahtarına kitabın sonundan ulaşabilirsiniz")).toBe(false);
    expect(isKeyHeading("CEVAP ANAHTARI")).toBe(true);
    expect(isKeyHeading("Fen Bilimleri Cevap Anahtarı")).toBe(true);
    expect(isKeyHeading("CEVAP ANAHTARI (1-20)")).toBe(true);
  });

  it("başlık cümlesi olan soru sayfası atlanmaz", () => {
    const fragments = [frag(0.08, 0.05, "Cevap anahtarı son sayfadadır."), ...column(0.08, [1, 2, 3, 4], 0.12, 0.2)];
    const keys = detectAnswerKeys([fragments]);
    expect(keys.keyPages).toEqual([]);
    const [page] = detectDocument([fragments], { answerKeyFrom: keys.pages.map((entry) => (entry.isKey ? entry.fromY : null)) });
    expect(page?.skipped).toBeUndefined();
    expect(numbersOf(page)).toEqual([1, 2, 3, 4]);
  });

  it("tek satırda soru ve şık yazan sayfayı anahtar saymaz", () => {
    const rows = Array.from({ length: 10 }, (_, index) => frag(0.08, 0.1 + index * 0.08, `${index + 1}. Kaç eder? A) 3 B) 4 C) 5 D) 6`));
    expect(detectAnswerKeyPage(0, rows).isKey).toBe(false);
    const [page] = detectDocument([rows], { answerKeyFrom: [null] });
    expect(page?.skipped).toBeUndefined();
    expect(numbersOf(page)).toHaveLength(10);
  });

  it("şık etiketi içindeki sayıları cevap diye eşlemez", () => {
    const page = detectAnswerKeyPage(0, [frag(0.3, 0.05, "CEVAP ANAHTARI"), frag(0.1, 0.1, "A) 5 B) 6 C) 7 D) 8")]);
    expect(page.answers.size).toBe(0);
  });

  it("gerçek anahtar sayfası yine atlanır", () => {
    const rows = Array.from({ length: 12 }, (_, index) => frag(0.1, 0.1 + index * 0.03, `${index + 1}. ${"ABCD"[index % 4]}`));
    const keys = detectAnswerKeys([rows]);
    expect(keys.keyPages).toEqual([0]);
    const [page] = detectDocument([rows], { answerKeyFrom: keys.pages.map((entry) => (entry.isKey ? entry.fromY : null)) });
    expect(page?.skipped).toBe("answerKey");
  });

  it("anahtar sanılsa bile güçlü soru zinciri varsa sayfayı atlamaz ve uyarır", () => {
    const [page] = detectDocument([column(0.08, [1, 2, 3, 4], 0.1, 0.2)], { answerKeyFrom: [0] });
    expect(page?.skipped).toBeUndefined();
    expect(numbersOf(page)).toEqual([1, 2, 3, 4]);
    expect(page?.confidence).toBe("low");
    expect(page?.issues.map((issue) => issue.code)).toContain("answerKeyDoubt");
  });
});

describe("metinden gelen çerçevelerde numara (D2)", () => {
  function box(id: string, y: number, extra: Partial<SplitBox> = {}): SplitBox {
    return { id, page: 0, rect: { x: 0.1, y, width: 0.4, height: 0.1 }, option: undefined, transferred: false, ...extra };
  }
  const text = (id: string, y: number, detected: number) => box(id, y, { source: "text", detectedNumber: detected });

  it("boşluklu sayfada cevap anahtarı okunan numaraya göre uygulanır", () => {
    const boxes = [text("a", 0.1, 1), text("b", 0.3, 2), text("c", 0.5, 4), text("d", 0.7, 5)];
    const result = applyAnswers(boxes, new Map([[1, "A"], [2, "B"], [3, "C"], [4, "D"], [5, "A"]]));
    expect(result.boxes.map((entry) => entry.option)).toEqual(["A", "B", "D", "A"]);
    expect(result.unmatched).toEqual([3]);
  });

  it("elle çizilenler başlangıç numarasına göre numaralanır", () => {
    const boxes = [box("m1", 0.1), box("m2", 0.3), text("t", 0.5, 9)];
    expect(numberingOf(boxes, 5).get("m1")).toBe(5);
    expect(numberingOf(boxes, 5).get("m2")).toBe(6);
    expect(numberingOf(boxes, 5).get("t")).toBe(9);
    expect(numberFor(boxes, "t", 5)).toBe(9);
    expect(boxNumber(boxes[2]!, 2, 5)).toBe(9);
    expect(boxNumber(boxes[0]!, 0, 5)).toBe(5);
  });
});
