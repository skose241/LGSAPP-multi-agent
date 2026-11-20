import { settingChanges, validateSettingValue } from "./ai";

export { settingChanges, validateSettingValue };

export interface GeneralSettingInfo {
  label: string;
  hint: string;
  caution?: string;
}

export interface GeneralSettingGroup {
  id: string;
  title: string;
  description: string;
  keys: readonly string[];
}

export const GENERAL_SETTING_GROUPS: readonly GeneralSettingGroup[] = [
  {
    id: "puanlar",
    title: "Puanlar",
    description: "Öğrencilerin liderlik tablosuna yansıyan puanlar.",
    keys: ["puanDogruCevap", "puanSoruYukleme", "puanCozumYazma", "puanliSoruYuklemeGunluk"],
  },
  {
    id: "limitler",
    title: "Günlük Limitler",
    description: "Kullanıcıların bir günde yapabileceği yükleme sayıları.",
    keys: ["gunlukSoruYuklemeLimiti", "gunlukDosyaLimitiOgrenci", "gunlukDosyaLimitiOgretmen"],
  },
  {
    id: "yorum-cozum",
    title: "Yorum ve Çözüm",
    description: "Açıklama, çözüm ve yorum yazarken geçerli uzunluk ve süre kuralları.",
    keys: [
      "aciklamaMinKarakter",
      "cozumMaxKarakter",
      "yorumMaxKarakter",
      "yorumDuzenlemeDk",
      "yorumSoruBasinaMax",
      "yorumMaxDerinlik",
      "yorumGorunurDerinlik",
    ],
  },
  {
    id: "sikayet",
    title: "Şikâyet",
    description: "Şikâyet açıklaması kuralı.",
    keys: ["sikayetMinKarakter"],
  },
  {
    id: "cozum-bekleyenler",
    title: "Çözüm Bekleyenler Eşikleri",
    description: "Öğretmenlerin çözüm bekleyenler listesine hangi soruların düşeceğini belirler.",
    keys: ["cozumEsikCevapSayisi", "cozumEsikYanlisOrani"],
  },
];

export const GENERAL_SETTING_KEYS: readonly string[] = GENERAL_SETTING_GROUPS.flatMap((group) => group.keys);

const generalSettingInfos: Record<string, GeneralSettingInfo> = {
  puanDogruCevap: { label: "Doğru Cevap Puanı", hint: "Bir soruyu ilk denemede doğru cevaplayana verilen puan." },
  puanSoruYukleme: { label: "Soru Yükleme Puanı", hint: "Öğrencinin yüklediği her puanlı soru için verilen puan." },
  puanCozumYazma: { label: "Çözüm Yazma Puanı", hint: "Öğrencinin yazdığı çözüm için verilen puan." },
  puanliSoruYuklemeGunluk: { label: "Günlük Puanlı Soru Yükleme Sayısı", hint: "Bir öğrencinin günde kaç soru yüklemesi puan kazandırır." },
  gunlukSoruYuklemeLimiti: {
    label: "Öğrenci Günlük Soru Yükleme Limiti",
    hint: "Bir öğrencinin günde yükleyebileceği soru sayısı.",
    caution: "0 yazılırsa hiçbir öğrenci soru yükleyemez; sınırsız anlamına gelmez.",
  },
  gunlukDosyaLimitiOgrenci: { label: "Öğrenci Günlük Fotoğraf Limiti", hint: "Bir öğrencinin günde yükleyebileceği fotoğraf sayısı." },
  gunlukDosyaLimitiOgretmen: { label: "Öğretmen/Müdür Günlük Fotoğraf Limiti", hint: "Bir öğretmen veya müdürün günde yükleyebileceği fotoğraf sayısı." },
  aciklamaMinKarakter: { label: "Çözüm Açıklaması Asgari Karakter", hint: "Öğrencinin cevap açıklamasında yazması gereken asgari karakter sayısı." },
  cozumMaxKarakter: { label: "Çözüm Azami Karakter", hint: "Elle yazılan bir çözümün azami karakter sayısı." },
  yorumMaxKarakter: { label: "Yorum Azami Karakter", hint: "Bir yorumun azami karakter sayısı." },
  yorumDuzenlemeDk: { label: "Yorum Düzenleme Süresi (Dakika)", hint: "Yorum yazıldıktan sonra düzenlenebildiği süre. 0 düzenlemeyi kapatır." },
  yorumSoruBasinaMax: { label: "Soru Başına Azami Yorum", hint: "Bir soruya yazılabilecek toplam yorum sayısı." },
  yorumMaxDerinlik: {
    label: "Yorum Azami Derinliği",
    hint: "Yanıt zincirinin inebileceği en derin seviye.",
    caution: "Tüm sorulardaki tartışma ağaçlarında yeni yanıtların inebileceği en derin seviyeyi değiştirir.",
  },
  yorumGorunurDerinlik: {
    label: "Listede Görünen Yorum Derinliği",
    hint: "Bir yorumun altında ilk açılışta gösterilen seviye sayısı. Azami derinlikten büyük olamaz.",
    caution: "Tüm sorulardaki tartışma listelerinin ilk açılışta kaç seviye göstereceğini değiştirir.",
  },
  sikayetMinKarakter: { label: "Şikâyet Açıklaması Asgari Karakter", hint: "Şikâyet açıklamasının asgari karakter sayısı." },
  cozumEsikCevapSayisi: {
    label: "Asgari Cevap Sayısı",
    hint: "Bir soru çözüm bekleyenler listesine düşmeden önce gereken cevap sayısı.",
    caution: "Öğretmenlerin çözüm bekleyenler listesindeki sorular hemen değişir; çok düşük değer listeyi şişirir.",
  },
  cozumEsikYanlisOrani: {
    label: "Yanlış Cevap Oranı Eşiği (%)",
    hint: "Yanlış cevap oranı bu yüzdeyi aşan sorular çözüm bekleyenler listesine düşer.",
    caution: "Öğretmenlerin çözüm bekleyenler listesindeki sorular hemen değişir; 0 değeri eşiği fiilen kaldırır.",
  },
};

export function generalSettingInfo(key: string): GeneralSettingInfo {
  return generalSettingInfos[key] ?? { label: key, hint: "" };
}

export interface SettingCrossRule {
  lowerKey: string;
  upperKey: string;
  message: string;
}

export const SETTING_CROSS_RULES: readonly SettingCrossRule[] = [
  { lowerKey: "yorumGorunurDerinlik", upperKey: "yorumMaxDerinlik", message: "Görünen derinlik, azami derinlikten büyük olamaz." },
  { lowerKey: "aciklamaMinKarakter", upperKey: "cozumMaxKarakter", message: "Asgari açıklama uzunluğu, çözüm azami uzunluğundan büyük olamaz." },
];

export function validateCrossRules(
  current: { key: string; value: number }[],
  edited: Record<string, string>,
): Record<string, string> {
  const effective = new Map<string, number>();
  for (const item of current) {
    const raw = edited[item.key];
    const parsed = raw === undefined ? item.value : Number(raw.trim());
    effective.set(item.key, raw !== undefined && !/^-?\d+$/.test(raw.trim()) ? item.value : parsed);
  }
  const errors: Record<string, string> = {};
  for (const rule of SETTING_CROSS_RULES) {
    const touched = [rule.lowerKey, rule.upperKey].filter((key) => edited[key] !== undefined);
    const lower = effective.get(rule.lowerKey);
    const upper = effective.get(rule.upperKey);
    if (touched.length === 0 || lower === undefined || upper === undefined || lower <= upper) continue;
    for (const key of touched) errors[key] ??= rule.message;
  }
  return errors;
}

export function groupSettings<T extends { key: string; group: string }>(
  items: T[],
  groups: readonly GeneralSettingGroup[] = GENERAL_SETTING_GROUPS,
): { group: GeneralSettingGroup; settings: T[] }[] {
  const byKey = new Map(items.filter((item) => item.group === "genel").map((item) => [item.key, item]));
  return groups
    .map((group) => ({
      group,
      settings: group.keys.flatMap((key) => {
        const found = byKey.get(key);
        return found ? [found] : [];
      }),
    }))
    .filter((entry) => entry.settings.length > 0);
}
