import { describe, expect, it } from "vitest";
import type { TextFragment } from "@/lib/pdf/text-content";
import { detectAnswerKeyPage, detectAnswerKeys, isKeyHeading } from "./answer-key-detect";
import { DRAFT_VERSION, loadDraft, saveDraft, type DraftStorage } from "./draft-store";
import { applySectionKeys, boxLabel, type SplitBox } from "./model";
import { sectionLabelOf } from "./sections";
import { applyDetections } from "./suggest";
import { detectDocument, pageHeading, parseLine } from "./text-detect";
import { toLines } from "./text-lines";
import { question, frag } from "./text-test-utils";

const LEFT = 0.077;
const RIGHT = 0.513;

function numbered(x: number, y: number, number: number): TextFragment[] {
  return question({ x, y, number });
}

function page(left: number[], right: number[], extra: TextFragment[] = [], heading: string | null = null): TextFragment[] {
  const fragments: TextFragment[] = [];
  if (heading) fragments.push(frag(0.44, 0.057, heading, 0.0135));
  left.forEach((number, index) => fragments.push(...numbered(LEFT, 0.12 + index * 0.4, number)));
  right.forEach((number, index) => fragments.push(...numbered(RIGHT, 0.12 + index * 0.4, number)));
  return [...fragments, ...extra];
}

function basePages(): TextFragment[][] {
  return [page([1, 2], [3, 4]), page([5, 6], [7, 8]), page([9], [], [], null), page([10, 11], [12, 13]), page([14, 15], [16, 17])];
}

function codes(result: ReturnType<typeof detectDocument>[number] | undefined): string[] {
  return result?.issues.map((issue) => issue.code) ?? [];
}

function numbersOf(result: ReturnType<typeof detectDocument>[number] | undefined): number[] {
  return result?.boxes.map((box) => box.number) ?? [];
}

describe("içerikteki numaralı etiketler (madde 1)", () => {
  it("şekil etiketleri gerçek numarayı ezmez", () => {
    const pages = basePages();
    pages[2] = page([9], [], [frag(0.37, 0.234, "1. satır Bizim Çocuklar"), frag(0.37, 0.264, "2. satır Bizim Çocuklar"), frag(0.373, 0.328, "9. satır B . . .")]);
    const results = detectDocument(pages);
    expect(numbersOf(results[2])).toEqual([9]);
    expect(codes(results[2])).toEqual([]);
    expect(results.every((result) => result.confidence === "high")).toBe(true);
  });

  it("'1. Etkinlik' gibi etiketler kenar dışı olduğu için atılır", () => {
    const pages = basePages();
    pages[2] = page([9], [], [frag(0.13, 0.3, "1. Etkinlik"), frag(0.13, 0.35, "2. Etkinlik")]);
    const results = detectDocument(pages);
    expect(numbersOf(results[2])).toEqual([9]);
    expect(codes(results[2])).toEqual([]);
  });

  it("içerikteki '1. Uygulama' ve '1. konum' sahte geri gitme uyarısı üretmez", () => {
    const pages = basePages();
    pages[3] = page([10, 11], [12, 13], [frag(0.146, 0.2, "1. Uygulama"), frag(0.421, 0.2, "1. konum"), frag(0.372, 0.28, "1. durum çizelgesi")]);
    const results = detectDocument(pages);
    expect(numbersOf(results[3])).toEqual([10, 11, 12, 13]);
    expect(codes(results[3])).toEqual([]);
  });

  it("etiket kalıpları kenarı bilinmeyen küçük belgede de numara sayılmaz", () => {
    expect(isLabel("1. satır Bizim Çocuklar")).toBe(true);
    expect(isLabel("2. Etkinlik")).toBe(true);
    expect(isLabel("1. çaprazlama: Mor çiçekli")).toBe(true);
    expect(isLabel("1. Uygulama1. Uygulama")).toBe(true);
    expect(isLabel("13. Millî futbol takımımızı")).toBe(false);
  });

  it("beklenen numara zincir seçiminde öncelik alır", () => {
    const pages = basePages();
    pages[4] = page([14, 15], [16, 17], [frag(0.13, 0.5, "1. Etkinlik sonucu"), frag(0.13, 0.55, "2. aşama")]);
    expect(numbersOf(detectDocument(pages)[4])).toEqual([14, 15, 16, 17]);
  });
});

function isLabel(text: string): boolean {
  const pages = [[frag(0.2, 0.2, text)]];
  return detectDocument(pages)[0]?.boxes.length === 0;
}

describe("dar sütun boşluğu (madde 2)", () => {
  it("iki sütunun aynı satıra düştüğü sayfada ikinci soruyu kaybetmez", () => {
    const pages = basePages();
    const long = { ...frag(0.115, 0.12, "Doğal ortamında yaşayan bir su bitkisinin hava"), w: 0.37 };
    const row = [frag(LEFT, 0.12, "3."), long, frag(RIGHT, 0.12, "4."), frag(0.551, 0.12, "Bir ekosistemde bazı canlılar")];
    const lower = [...numbered(LEFT, 0.5, 5).slice(0, 0)];
    pages[1] = [...row, ...lower, frag(0.115, 0.35, "A) birinci"), frag(0.115, 0.4, "B) ikinci"), frag(0.551, 0.35, "A) birinci"), frag(0.551, 0.4, "B) ikinci")];
    const results = detectDocument([pages[0] ?? [], pages[1] ?? [], ...pages.slice(2)]);
    expect(numbersOf(results[1])).toEqual([3, 4]);
  });

  it("satır ortasındaki numara kenara denk gelse bile önünde boşluk yoksa bölünmez", () => {
    const lines = toLines([frag(0.1, 0.2, "toplam"), frag(0.145, 0.2, "12."), frag(0.19, 0.2, "sayı")], { splitAt: [0.145] });
    expect(lines).toHaveLength(1);
  });

  it("öğrenilen kenarda boşlukla başlayan numarayı satırdan ayırır", () => {
    const lines = toLines([frag(0.077, 0.2, "3."), { ...frag(0.115, 0.2, "uzun metin"), w: 0.37 }, frag(0.513, 0.2, "4."), frag(0.551, 0.2, "başka")], { splitAt: [0.077, 0.513] });
    expect(lines.map((line) => line.text)).toEqual(["3. uzun metin", "4. başka"]);
  });
});

describe("test yönergesi kutusu (madde 3)", () => {
  it("'Bu testte 20 soru vardır.' soru sayılmaz", () => {
    const pages = basePages();
    pages[0] = page([1, 2], [3, 4], [frag(0.089, 0.095, "1. Bu testte 20 soru vardır."), frag(0.089, 0.108, "2. Cevaplarınızı, cevap kâğıdına işaretleyiniz.")]);
    const results = detectDocument(pages);
    expect(numbersOf(results[0])).toEqual([1, 2, 3, 4]);
    expect(codes(results[0])).toEqual([]);
  });

  it("küçük belgede de yönerge kalıbı elenir", () => {
    const fragments = [frag(0.089, 0.05, "1. Bu testte 20 soru vardır."), frag(0.089, 0.07, "2. Cevaplarınızı, cevap kâğıdına işaretleyiniz."), ...numbered(0.077, 0.15, 1), ...numbered(0.077, 0.5, 2)];
    const [result] = detectDocument([fragments]);
    expect(numbersOf(result)).toEqual([1, 2]);
    expect(codes(result)).toEqual([]);
  });
});

describe("ders bölümleri (madde 4)", () => {
  function sectioned(): TextFragment[][] {
    return [
      page([1, 2], [3, 4], [], "MATEMATİK"),
      page([5, 6], [7, 8], [], "MATEMATİKMATEMATİK"),
      page([9, 10], [11, 12]),
      page([1, 2], [3, 4], [], "FEN BİLİMLERİ"),
      page([5, 6], [7, 8]),
    ];
  }

  it("başlıktan bölüm adını okur", () => {
    expect(pageHeading(toLines([frag(0.44, 0.057, "MATEMATİK")]))).toBe("Matematik");
    expect(pageHeading(toLines([frag(0.75, 0.057, "FEN BİLİMLERİ")]))).toBe("Fen");
    expect(pageHeading(toLines([frag(0.44, 0.4, "MATEMATİK")]))).toBeNull();
    expect(sectionLabelOf("MATEMATİKMATEMATİK")).toBe("Matematik");
    expect(sectionLabelOf("T.C. İNKILAP TARİHİ VE ATATÜRKÇÜLÜK")).toBe("İnkılap");
    expect(sectionLabelOf("Matematik dersi çok önemlidir")).toBeNull();
  });

  it("numara 1'e dönünce yeni bölüm sayılır, devamlılık uyarısı vermez", () => {
    const results = detectDocument(sectioned());
    expect(results.map((result) => result.section)).toEqual(["Matematik", "Matematik", "Matematik", "Fen", "Fen"]);
    expect(results.every((result) => result.confidence === "high")).toBe(true);
    expect(results.flatMap(codes)).toEqual([]);
  });

  it("başlıksız numara yeniden başlayınca 'Bölüm 2' adı verir", () => {
    const pages = [page([1, 2], [3, 4]), page([5, 6], [7, 8]), page([9, 10], [11, 12]), page([1, 2], [3, 4]), page([5, 6], [7, 8])];
    const results = detectDocument(pages);
    expect(results.map((result) => result.section)).toEqual(["Bölüm 1", "Bölüm 1", "Bölüm 1", "Bölüm 2", "Bölüm 2"]);
    expect(results.flatMap(codes)).toEqual([]);
  });

  it("tek bölümlü belgede bölüm adı yazılmaz, aynı bölümde sıra bozulursa uyarı verir", () => {
    const results = detectDocument([page([1, 2], [3, 4]), page([7, 8], [9, 10])]);
    expect(results[0]?.section).toBeUndefined();
    expect(codes(results[1])).toContain("continuity");
  });

  it("aynı numara iki bölümde bulununca çerçeveler ve cevaplar karışmaz", () => {
    const results = detectDocument(sectioned());
    const boxes = applyDetections([], results).boxes;
    const keys = [
      { name: "Matematik", answers: new Map<number, string>(Array.from({ length: 12 }, (_, index) => [index + 1, "A"] as [number, string])) },
      { name: "Fen", answers: new Map<number, string>(Array.from({ length: 8 }, (_, index) => [index + 1, "C"] as [number, string])) },
    ];
    const applied = applySectionKeys(boxes, keys);
    expect(applied.applied).toBe(20);
    expect(applied.unmatched).toEqual([]);
    const byLabel = (name: string) => applied.boxes.filter((box) => box.section === name).map((box) => box.option);
    expect(byLabel("Matematik").every((option) => option === "A")).toBe(true);
    expect(byLabel("Fen").every((option) => option === "C")).toBe(true);
    expect(byLabel("Fen")).toHaveLength(8);
  });

  it("çerçeve etiketi bölümü içerir", () => {
    const box: SplitBox = { id: "a", page: 0, rect: { x: 0, y: 0, width: 0.5, height: 0.5 }, option: undefined, transferred: false, section: "Fen" };
    expect(boxLabel(box, 3)).toBe("Fen 3");
    expect(boxLabel({ ...box, section: undefined }, 3)).toBe("Soru 3");
  });

  it("bölüm öneri çerçevelerine geçer ve taslakta korunur", () => {
    const boxes = applyDetections([], detectDocument(sectioned())).boxes;
    expect(boxes.filter((box) => box.section === "Fen")).toHaveLength(8);
    const map = new Map<string, string>();
    const storage: DraftStorage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key) };
    saveDraft(storage, "t", { version: DRAFT_VERSION, sourceKey: "pdf:x", savedAt: 1, pageCount: 5, boxes, rotations: {} });
    const loaded = loadDraft(storage, "t", "pdf:x", 5);
    expect(loaded?.boxes.filter((box) => box.section === "Fen")).toHaveLength(8);
    expect(loaded?.boxes.filter((box) => box.section === "Matematik")).toHaveLength(12);
  });
});

function keyPage(heading: string, columns: { name: string; x: number; letters: string }[]): TextFragment[] {
  const fragments: TextFragment[] = [frag(0.323, 0.069, heading, 0.012)];
  for (const column of columns) {
    fragments.push(frag(column.x - 0.03, 0.11, column.name, 0.012));
    [...column.letters].forEach((letter, index) => {
      const y = 0.14 + index * 0.018;
      fragments.push(frag(column.x, y, `${index + 1}.`, 0.011), frag(column.x + 0.02, y, letter, 0.011));
    });
  }
  return fragments;
}

describe("cevap anahtarı bölümleri (madde 5)", () => {
  it("başlık satır sonunda olabilir, cümle olamaz", () => {
    expect(isKeyHeading("“A” KİTAPÇIĞI CEVAP ANAHTARI")).toBe(true);
    expect(isKeyHeading("2026 SAYISAL BÖLÜM CEVAP ANAHTARI")).toBe(true);
    expect(isKeyHeading("Cevap anahtarı son sayfadadır.")).toBe(false);
    expect(isKeyHeading("Soruların cevap anahtarı sayfa sonundadır")).toBe(false);
  });

  it("iki ders sütununu başlıklarıyla eşler", () => {
    const math = "BBDCBCADDABDACACDBBC";
    const science = "CADBACBDBCBADCADBCAB";
    const result = detectAnswerKeyPage(32, keyPage("“A” KİTAPÇIĞI CEVAP ANAHTARI", [{ name: "MATEMATİK", x: 0.305, letters: math }, { name: "FEN BİLİMLERİ", x: 0.587, letters: science }]));
    expect(result.isKey).toBe(true);
    expect(result.sections.map((section) => section.name)).toEqual(["Matematik", "Fen"]);
    const read = (index: number) => [...(result.sections[index]?.answers ?? [])].sort((a, b) => a[0] - b[0]).map(([, letter]) => letter).join("");
    expect(read(0)).toBe(math);
    expect(read(1)).toBe(science);
    expect(result.fromY).toBeCloseTo(0.069, 2);
  });

  it("aynı numaralar iki derste çakışma sayılmaz, belge düzeyinde bölümler korunur", () => {
    const page = keyPage("CEVAP ANAHTARI", [{ name: "MATEMATİK", x: 0.3, letters: "ABCDABCD" }, { name: "FEN BİLİMLERİ", x: 0.58, letters: "DCBADCBA" }]);
    const keys = detectAnswerKeys([page]);
    expect(keys.conflicts).toEqual([]);
    expect(keys.sections).toHaveLength(2);
    expect(keys.sections[0]?.answers.get(1)).toBe("A");
    expect(keys.sections[1]?.answers.get(1)).toBe("D");
  });

  it("başlıksız iki sütunlu anahtar sayfasını da bölümlere ayırır", () => {
    const page = keyPage("", [{ name: "MATEMATİK", x: 0.3, letters: "ABCDABCDABCD" }, { name: "FEN BİLİMLERİ", x: 0.58, letters: "DCBADCBADCBA" }]).slice(1);
    const result = detectAnswerKeyPage(0, page);
    expect(result.isKey).toBe(true);
    expect(result.sections).toHaveLength(2);
  });

  it("anahtar sayfasında soru önerisi üretilmez", () => {
    const page = keyPage("“A” KİTAPÇIĞI CEVAP ANAHTARI", [{ name: "MATEMATİK", x: 0.305, letters: "BBDCBCADDABDACACDBBC" }, { name: "FEN BİLİMLERİ", x: 0.587, letters: "CADBACBDBCBADCADBCAB" }]);
    const pages = [...basePages(), page];
    const keys = detectAnswerKeys(pages);
    const results = detectDocument(pages, { answerKeyFrom: keys.pages.map((entry) => (entry.isKey ? entry.fromY : null)) });
    expect(results[5]?.skipped).toBe("answerKey");
    expect(results[5]?.boxes).toEqual([]);
  });

  it("tek bölümlü anahtar sayısı bölüm adı olmadan çalışır", () => {
    const boxes = applyDetections([], detectDocument([page([1, 2], [3, 4])])).boxes;
    const applied = applySectionKeys(boxes, [{ name: null, answers: new Map([[1, "A"], [2, "B"], [3, "C"], [4, "D"], [9, "A"]]) }]);
    expect(applied.applied).toBe(4);
    expect(applied.unmatched).toEqual([{ name: null, numbers: [9] }]);
  });
});

describe("soru olmayan sayfalar (madde 6)", () => {
  function cover(): TextFragment[] {
    return [
      frag(0.3, 0.1, "T.C. MİLLÎ EĞİTİM BAKANLIĞI"),
      frag(0.136, 0.671, "1. Salon yoklama listesinde belirtilen sınıfta ve sıra numarasında oturunuz"),
      frag(0.136, 0.693, "2. Cevap kâğıdındaki kimlik bilgilerinin doğruluğunu kontrol ediniz."),
      frag(0.136, 0.732, "3. Kitapçık türünü cevap kâğıdındaki ilgili alana kodlayınız."),
      frag(0.136, 0.755, "4. Cevap kâğıdı üzerindeki kodlamaları siyah kurşun kalemle yapınız."),
    ];
  }

  function rules(): TextFragment[] {
    return Array.from({ length: 12 }, (_, index) => frag(0.095, 0.125 + index * 0.05, `${index + 1}. Sınav kurallarına uygun davranınız ve görevlilerin uyarılarına uyunuz.`));
  }

  it("kapak ve arka kapak kuralları soru önerisi üretmez", () => {
    const pages = [cover(), ...basePages(), rules()];
    const results = detectDocument(pages);
    expect(results[0]?.boxes).toEqual([]);
    expect(results[0]?.issues.map((issue) => issue.code)).toEqual(["noQuestions"]);
    expect(results[6]?.boxes).toEqual([]);
    expect(results[6]?.issues.map((issue) => issue.code)).toEqual(["noQuestions"]);
    for (const index of [1, 2, 3, 4, 5]) expect(results[index]?.boxes.length).toBeGreaterThan(0);
  });

  it("kenara oturan ama şıksız ve devam etmeyen sayfayı soru saymaz", () => {
    const fake = [frag(LEFT, 0.2, "1. Bu sayfa bir özet metnidir ve soru değildir."), frag(LEFT, 0.4, "2. İkinci madde de bir açıklamadır ve soru değildir.")];
    const results = detectDocument([...basePages(), fake]);
    expect(results[5]?.boxes).toEqual([]);
    expect(codes(results[5])).toEqual(["noQuestions"]);
  });

  it("şıkları resim olan ama numarası devam eden sayfayı kabul eder", () => {
    const figure = [frag(LEFT, 0.2, "18. Şekildeki devrede lamba parlaklığı için aşağıdakilerden hangisi doğrudur?")];
    const results = detectDocument([...basePages(), figure]);
    expect(numbersOf(results[5])).toEqual([18]);
  });

  it("rozet metni 'Soru Bulunamadı' olur", async () => {
    const { badgeFor } = await import("./text-detect");
    const results = detectDocument([cover(), ...basePages()]);
    expect(badgeFor(results[0]!)).toBe("Soru Bulunamadı");
  });

  it("parseLine içerik etiketlerini yine numara olarak görür, eleme belge düzeyinde yapılır", () => {
    expect(parseLine("1. satır Bizim Çocuklar").number).toBe(1);
  });
});
