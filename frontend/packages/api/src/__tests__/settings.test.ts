import { describe, expect, it } from "vitest";
import {
  GENERAL_SETTING_GROUPS,
  GENERAL_SETTING_KEYS,
  generalSettingInfo,
  groupSettings,
  settingChanges,
  validateCrossRules,
} from "../settings";

const ALL_GENERAL = [
  "puanDogruCevap",
  "puanSoruYukleme",
  "puanCozumYazma",
  "puanliSoruYuklemeGunluk",
  "gunlukSoruYuklemeLimiti",
  "gunlukDosyaLimitiOgrenci",
  "gunlukDosyaLimitiOgretmen",
  "aciklamaMinKarakter",
  "sikayetMinKarakter",
  "cozumMaxKarakter",
  "yorumMaxKarakter",
  "yorumDuzenlemeDk",
  "yorumSoruBasinaMax",
  "yorumMaxDerinlik",
  "yorumGorunurDerinlik",
  "cozumEsikCevapSayisi",
  "cozumEsikYanlisOrani",
];

describe("genel ayar etiketleri", () => {
  it("tüm genel anahtarlar bir grupta ve etiketli, tekrar yok", () => {
    expect([...GENERAL_SETTING_KEYS].sort()).toEqual([...ALL_GENERAL].sort());
    expect(new Set(GENERAL_SETTING_KEYS).size).toBe(GENERAL_SETTING_KEYS.length);
    for (const key of ALL_GENERAL) {
      const info = generalSettingInfo(key);
      expect(info.label).not.toBe(key);
      expect(info.hint.length).toBeGreaterThan(0);
    }
  });

  it("kritik anahtarların uyarı metni var", () => {
    for (const key of ["yorumMaxDerinlik", "yorumGorunurDerinlik", "cozumEsikCevapSayisi", "cozumEsikYanlisOrani", "gunlukSoruYuklemeLimiti"]) {
      expect(generalSettingInfo(key).caution).toBeTruthy();
    }
  });

  it("günlük soru yükleme limiti uyarısı sıfırın sınırsız olmadığını söyler", () => {
    expect(generalSettingInfo("gunlukSoruYuklemeLimiti").caution).toBe("0 yazılırsa hiçbir öğrenci soru yükleyemez; sınırsız anlamına gelmez.");
  });

  it("gruplama yalnız genel grubu ve tanımlı sırayı döndürür", () => {
    const items = [
      { key: "sikayetMinKarakter", group: "genel" },
      { key: "aiCozumAktifMi", group: "ai" },
      { key: "puanDogruCevap", group: "genel" },
    ];
    const grouped = groupSettings(items);
    expect(grouped.map((entry) => entry.group.id)).toEqual(["puanlar", "sikayet"]);
    expect(grouped.flatMap((entry) => entry.settings.map((item) => item.key))).toEqual(["puanDogruCevap", "sikayetMinKarakter"]);
    expect(GENERAL_SETTING_GROUPS.length).toBe(5);
  });
});

describe("çapraz kurallar", () => {
  const current = [
    { key: "yorumGorunurDerinlik", value: 3 },
    { key: "yorumMaxDerinlik", value: 10 },
    { key: "aciklamaMinKarakter", value: 30 },
    { key: "cozumMaxKarakter", value: 4000 },
  ];

  it("ihlali değişen anahtarlara bağlar", () => {
    const errors = validateCrossRules(current, { yorumMaxDerinlik: "2" });
    expect(Object.keys(errors)).toEqual(["yorumMaxDerinlik"]);
    const both = validateCrossRules(current, { yorumMaxDerinlik: "2", yorumGorunurDerinlik: "5" });
    expect(Object.keys(both).sort()).toEqual(["yorumGorunurDerinlik", "yorumMaxDerinlik"]);
  });

  it("geçerli değerlerde ve dokunulmamış kurallarda hata vermez", () => {
    expect(validateCrossRules(current, { yorumMaxDerinlik: "5", yorumGorunurDerinlik: "5" })).toEqual({});
    expect(validateCrossRules(current, { puanDogruCevap: "1" })).toEqual({});
    expect(validateCrossRules(current, { aciklamaMinKarakter: "5000" })).toHaveProperty("aciklamaMinKarakter");
  });

  it("sayı olmayan girdi çapraz kontrolü bozmaz", () => {
    expect(validateCrossRules(current, { yorumMaxDerinlik: "abc" })).toEqual({});
  });
});

describe("değişiklik çıkarma", () => {
  it("yalnız değişen tam sayıları döndürür", () => {
    const current = [
      { key: "puanDogruCevap", value: 5 },
      { key: "sikayetMinKarakter", value: 10 },
    ];
    expect(settingChanges(current, { puanDogruCevap: "5", sikayetMinKarakter: "25" })).toEqual({ sikayetMinKarakter: 25 });
    expect(settingChanges(current, { sikayetMinKarakter: "x" })).toEqual({});
  });
});
