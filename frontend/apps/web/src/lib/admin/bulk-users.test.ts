import { describe, expect, it } from "vitest";
import {
  BULK_MAX_ROWS,
  detectDelimiter,
  mapBulkServerErrors,
  normalizeRole,
  parseBulkUsers,
  parseDelimited,
  passwordsToTsv,
  toBulkItems,
  toPasswordRows,
} from "./bulk-users";

const lessons = [
  { id: 1, name: "Matematik" },
  { id: 2, name: "Türkçe" },
];

describe("ayırıcı algılama", () => {
  it("noktalı virgülü, virgülü ve sekmeyi bulur", () => {
    expect(detectDelimiter("Ali;Veli;ali.veli;8-A;ogrenci")).toBe(";");
    expect(detectDelimiter("Ali,Veli,ali.veli,8-A,ogrenci")).toBe(",");
    expect(detectDelimiter("Ali\tVeli\tali.veli\t8-A\togrenci")).toBe("\t");
  });

  it("sekme öncelikli, tırnak içindeki ayırıcılar sayılmaz", () => {
    expect(detectDelimiter("Ali, Veli\tali.veli")).toBe("\t");
    expect(detectDelimiter('"Ali;Veli",x')).toBe(",");
  });

  it("ayırıcı yoksa noktalı virgüle düşer", () => {
    expect(detectDelimiter("tek")).toBe(";");
  });
});

describe("ayrıştırma", () => {
  it("BOM, başlık ve boş satırları atlar", () => {
    const text = "﻿ad;soyad;kullanıcıAdı;sınıf;rol\r\n\r\nAli;Veli;ali.veli;8-A;ogrenci\r\n;;;;\r\nAyşe;Öz;ayse.oz;;ogretmen\r\n";
    const result = parseBulkUsers(text, lessons);
    expect(result.hasHeader).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.line).toBe(3);
    expect(result.rows[1]?.userName).toBe("ayse.oz");
    expect(result.errorCount).toBe(0);
  });

  it("başlık yoksa ilk satır veridir", () => {
    const result = parseBulkUsers("Ali;Veli;ali.veli;8-A;ogrenci", lessons);
    expect(result.hasHeader).toBe(false);
    expect(result.rows).toHaveLength(1);
  });

  it("tırnaklı alanlarda ayırıcı, çift tırnak ve satır sonu korunur", () => {
    const records = parseDelimited('"Ali, Can";"Ve""li";x;"a\nb";ogrenci', ";");
    expect(records).toHaveLength(1);
    expect(records[0]?.cells[0]).toBe("Ali, Can");
    expect(records[0]?.cells[1]).toBe('Ve"li');
    expect(records[0]?.cells[3]).toBe("a\nb");
  });

  it("Excel sekmeli metnini ayrıştırır", () => {
    const result = parseBulkUsers("Ad\tSoyad\tKullanıcı Adı\tSınıf\tRol\nZeynep\tÇelik\tzeynep.celik\t8-B\tÖĞRENCİ", lessons);
    expect(result.delimiter).toBe("\t");
    expect(result.hasHeader).toBe(true);
    expect(result.rows[0]?.role).toBe("ogrenci");
    expect(result.rows[0]?.className).toBe("8-B");
  });

  it("Türkçe karakterli kullanıcı adını kabul eder", () => {
    const result = parseBulkUsers("Işıl;Şahin;ışıl.şahin;8-A;ogrenci", lessons);
    expect(result.rows[0]?.errors).toEqual({});
  });

  it("öğretmenin branş dersini adından eşler, öğrencide yok sayar", () => {
    const result = parseBulkUsers("A;B;ab.hoca;;Öğretmen;türkçe\nC;D;cd.ogr;8-A;ogrenci;Matematik\nE;F;ef.hoca;;ogretmen;Fizik", lessons);
    expect(result.rows[0]?.branchLessonId).toBe(2);
    expect(result.rows[1]?.branchLessonId).toBeNull();
    expect(result.rows[1]?.branchName).toBe("");
    expect(result.rows[2]?.errors.branchLessonId).toContain("Fizik");
  });

  it("öğrenci dışında sınıfı yok sayar", () => {
    const [item] = toBulkItems(parseBulkUsers("A;B;ab.hoca;9-A;ogretmen", lessons).rows);
    expect(item?.className).toBeNull();
  });
});

describe("rol", () => {
  it("büyük harf ve Türkçe yazımları normalleştirir", () => {
    expect(normalizeRole("ÖĞRENCİ")).toBe("ogrenci");
    expect(normalizeRole("Öğretmen")).toBe("ogretmen");
    expect(normalizeRole("MÜDÜR")).toBe("mudur");
    expect(normalizeRole("OGRENCI")).toBe("ogrenci");
    expect(normalizeRole("veli")).toBeNull();
  });
});

describe("doğrulama", () => {
  it("eksik ad, kısa kullanıcı adı ve bilinmeyen rolü işaretler", () => {
    const result = parseBulkUsers(";Veli;ab;8-A;veli", lessons);
    const errors = result.rows[0]?.errors ?? {};
    expect(errors.firstName).toBeDefined();
    expect(errors.userName).toBeDefined();
    expect(errors.role).toBeDefined();
    expect(result.errorCount).toBe(1);
  });

  it("rol eksikse zorunlu der", () => {
    expect(parseBulkUsers("Ali;Veli;ali.veli;8-A;", lessons).rows[0]?.errors.role).toContain("zorunlu");
  });

  it("istek içi yinelenen kullanıcı adını büyük-küçük harf gözetmeden yakalar", () => {
    const result = parseBulkUsers("A;B;Ali.Veli;;ogrenci\nC;D;ali.veli;;ogrenci\nE;F;baska.biri;;ogrenci", lessons);
    expect(result.rows[0]?.errors.userName).toBeUndefined();
    expect(result.rows[1]?.errors.userName).toContain("1. satırda");
    expect(result.rows[2]?.errors.userName).toBeUndefined();
  });

  it("100 satır sınırını aşınca işaretler ve fazlasını kırpar", () => {
    const lines = Array.from({ length: BULK_MAX_ROWS + 3 }, (_, index) => `Ayse;Demir;kullanici${index};;ogrenci`).join("\n");
    const result = parseBulkUsers(lines, lessons);
    expect(result.tooMany).toBe(true);
    expect(result.totalRows).toBe(BULK_MAX_ROWS + 3);
    expect(result.rows).toHaveLength(BULK_MAX_ROWS);
    expect(parseBulkUsers(lines.split("\n").slice(0, BULK_MAX_ROWS).join("\n"), lessons).tooMany).toBe(false);
  });

  it("fazla sütunu hata sayar", () => {
    expect(parseBulkUsers("A;B;ab.cd;8-A;ogrenci;;fazla", lessons).errorCount).toBe(1);
  });
});

describe("istek gövdesi ve sunucu hataları", () => {
  it("sırayla öğe üretir", () => {
    const rows = parseBulkUsers("Ali;Veli;ali.veli;8-A;ogrenci\nAyşe;Öz;ayse.oz;;ogretmen;Matematik", lessons).rows;
    expect(toBulkItems(rows)).toEqual([
      { userName: "ali.veli", firstName: "Ali", lastName: "Veli", role: "ogrenci", className: "8-A", branchLessonId: null },
      { userName: "ayse.oz", firstName: "Ayşe", lastName: "Öz", role: "ogretmen", className: null, branchLessonId: 1 },
    ]);
  });

  it("items[i].alan anahtarlarını satıra bağlar, PascalCase'i de kabul eder", () => {
    const mapped = mapBulkServerErrors({
      "items[1].username": ["Kullanıcı adı kullanımda."],
      "items[0].classname": ["Sınıf çok uzun."],
      "items": ["En az bir kullanıcı gerekli."],
      "$.items[2].role": ["Rol geçersiz."],
      bilinmeyen: ["Başka hata."],
    });
    expect(mapped.rows[1]?.userName).toBe("Kullanıcı adı kullanımda.");
    expect(mapped.rows[0]?.className).toBe("Sınıf çok uzun.");
    expect(mapped.rows[2]?.role).toBe("Rol geçersiz.");
    expect(mapped.general).toEqual(["En az bir kullanıcı gerekli.", "Başka hata."]);
  });
});

describe("şifre çıktısı", () => {
  it("sekmeli metin üretir ve hücre içi sekmeleri temizler", () => {
    const rows = toPasswordRows([
      { user: { firstName: "Ali", lastName: "Veli", userName: "ali.veli", className: "8-A", role: "ogrenci" }, oneTimePassword: "Abc-123" },
      { user: { firstName: "Ayşe", lastName: "Öz", userName: "ayse.oz", className: null, role: "ogretmen" }, oneTimePassword: "Xyz\t9" },
    ]);
    expect(passwordsToTsv(rows)).toBe(
      "Ad soyad\tKullanıcı adı\tSınıf\tRol\tŞifre\nAli Veli\tali.veli\t8-A\tÖğrenci\tAbc-123\nAyşe Öz\tayse.oz\t\tÖğretmen\tXyz 9",
    );
  });
});

describe("Excel formül enjeksiyonu", () => {
  const user = (firstName: string, lastName: string, userName: string, className: string | null) => ({
    user: { firstName, lastName, userName, className, role: "ogrenci" },
    oneTimePassword: "Pw1",
  });

  it("tehlikeli önekli ad, soyad, kullanıcı adı ve sınıf hücrelerine kesme işareti ekler", () => {
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
      const tsv = passwordsToTsv(toPasswordRows([user(`${lead}Ali`, "Veli", `${lead}kul`, `${lead}8-A`)]));
      const cells = tsv.split("\n")[1]!.split("\t");
      if (!/\s/.test(lead)) expect(cells[0]!.startsWith("'")).toBe(true);
      expect(cells[1]!.startsWith("'")).toBe(true);
      expect(cells[2]!.startsWith("'")).toBe(true);
      expect(cells).toHaveLength(5);
    }
    const cells = passwordsToTsv(toPasswordRows([user("Ali", "=Veli", "ali", "8-A")])).split("\n")[1]!.split("\t");
    expect(cells[0]).toBe("Ali =Veli");
    const lastOnly = passwordsToTsv(toPasswordRows([user("", "=Veli", "ali", "8-A")])).split("\n")[1]!.split("\t");
    expect(lastOnly[0]).toBe("'=Veli");
  });

  it("güvenli hücrelere dokunmaz ve şifreyi hiçbir zaman değiştirmez", () => {
    const rows = toPasswordRows([
      { user: { firstName: "Ali", lastName: "Veli", userName: "ali.veli", className: "8-A", role: "ogrenci" }, oneTimePassword: "=Abc+1" },
      { user: { firstName: "Ayşe", lastName: "Öz", userName: "ayse", className: null, role: "ogrenci" }, oneTimePassword: "-x@9" },
    ]);
    const lines = passwordsToTsv(rows).split("\n");
    expect(lines[1]).toBe("Ali Veli\tali.veli\t8-A\tÖğrenci\t=Abc+1");
    expect(lines[2]!.split("\t")[4]).toBe("-x@9");
  });
});
