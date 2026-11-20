import { addDaysToDateOnly, todayInIstanbul } from "./time";

export type AiRequestFailureKind =
  | "dailyLimit"
  | "rateLimit"
  | "providerDown"
  | "unprocessable"
  | "removed"
  | "forbidden"
  | "notFound"
  | "network"
  | "other";

export interface AiRequestFailure {
  kind: AiRequestFailureKind;
  message: string;
  retryAfter: number | null;
}

const DAILY_LIMIT_PATTERN = /hakk[ıi]n[ıi]z doldu|bug[uü]n i[cç]in yo[gğ]un/i;
const MAX_COUNTDOWN_SECONDS = 600;

export function classifyAiRequestFailure(status: number, message: string, retryAfter: number | null): AiRequestFailure {
  const wait = retryAfter !== null && retryAfter > 0 ? retryAfter : null;
  if (status === 429) {
    if (DAILY_LIMIT_PATTERN.test(message)) return { kind: "dailyLimit", message, retryAfter: null };
    return {
      kind: "rateLimit",
      message: "Kısa sürede çok fazla istek gönderildi.",
      retryAfter: wait === null ? 30 : Math.min(wait, MAX_COUNTDOWN_SECONDS),
    };
  }
  if (status === 503) {
    return { kind: "providerDown", message, retryAfter: wait === null ? 30 : Math.min(wait, MAX_COUNTDOWN_SECONDS) };
  }
  if (status === 422) return { kind: "unprocessable", message, retryAfter: null };
  if (status === 409) return { kind: "removed", message, retryAfter: null };
  if (status === 403) return { kind: "forbidden", message, retryAfter: null };
  if (status === 404) return { kind: "notFound", message, retryAfter: null };
  if (status === 0) return { kind: "network", message, retryAfter: null };
  return { kind: "other", message, retryAfter: null };
}

export function quotaSummary(quota: { enabled: boolean; dailyLimit: number | null; remainingToday: number | null; usedToday: number }): {
  canRequest: boolean;
  text: string;
} {
  if (!quota.enabled) {
    return { canRequest: false, text: "Yapay zekâ çözümü şu anda kapalı." };
  }
  if (quota.dailyLimit === null || quota.remainingToday === null) {
    return { canRequest: true, text: "Kişisel günlük limitiniz yok; istekler genel günlük limite sayılır." };
  }
  if (quota.remainingToday <= 0) {
    return { canRequest: false, text: "Bugünkü hakkınız doldu. Haklarınız her gün gece yarısı yenilenir." };
  }
  return { canRequest: true, text: `Bugün Kalan Hakkınız: ${quota.remainingToday} / ${quota.dailyLimit}` };
}

export const AI_USAGE_MAX_DAYS = 92;
export const AI_USAGE_DEFAULT_DAYS = 7;

export function usageRange(days: number, now: Date = new Date()): { from: string; to: string } {
  const safe = Math.min(AI_USAGE_MAX_DAYS, Math.max(1, Math.floor(days)));
  const to = todayInIstanbul(now);
  return { from: addDaysToDateOnly(to, -(safe - 1)), to };
}

const operationLabels: Record<string, string> = {
  questionGeneration: "Soru Üretimi",
  solution: "Çözüm",
  solutionInvalid: "Geçersiz Çözüm",
  answerMismatch: "Cevap Uyuşmazlığı",
  solutionVerification: "Soru Doğrulama",
  questionDetection: "Soru Tespiti",
};

export function aiOperationLabel(value: string): string {
  return operationLabels[value] ?? value;
}

const errorKindLabels: Record<string, string> = {
  none: "Hata Yok",
  rateLimited: "İstek Sınırı",
  quotaExhausted: "Günlük Kota Doldu",
  unavailable: "Sağlayıcı Ulaşılamıyor",
  timeout: "Zaman Aşımı",
  authFailed: "Anahtar Reddedildi",
  invalidRequest: "Geçersiz İstek",
  blocked: "İçerik Engellendi",
  truncated: "Yanıt Kesildi",
  invalidOutput: "Geçersiz Çıktı",
  unreadable: "Görsel Okunamadı",
  notConfigured: "Yapılandırılmadı",
  canceled: "İptal Edildi",
};

export function aiErrorKindLabel(value: string): string {
  return errorKindLabels[value] ?? value;
}

const providerLabels: Record<string, string> = { none: "Yok", gemini: "Gemini", fake: "Sahte (Test)" };

export function aiProviderLabel(value: string): string {
  return providerLabels[value] ?? value;
}

const gatePurposeLabels: Record<string, string> = { question: "Soru Üretimi", solution: "Çözüm" };

export function aiGatePurposeLabel(value: string): string {
  return gatePurposeLabels[value] ?? value;
}

export function formatUsd(value: number): string {
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
  return `$${value.toFixed(digits)}`;
}

export function formatSuccessRate(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const percent = value <= 1 ? value * 100 : value;
  return `%${Math.round(percent)}`;
}

export function formatTokens(value: number): string {
  return new Intl.NumberFormat("tr-TR").format(value);
}

export interface SettingMeta {
  key: string;
  min: number;
  max: number;
}

export function validateSettingValue(meta: SettingMeta, raw: string): string | null {
  const text = raw.trim();
  if (!/^-?\d+$/.test(text)) return "Tam sayı girin.";
  const value = Number(text);
  if (value < meta.min || value > meta.max) return `${meta.min} ile ${meta.max} arasında olmalıdır.`;
  return null;
}

export function settingChanges(
  current: { key: string; value: number }[],
  edited: Record<string, string>,
): Record<string, number> {
  const changes: Record<string, number> = {};
  for (const item of current) {
    const raw = edited[item.key];
    if (raw === undefined) continue;
    const value = Number(raw.trim());
    if (Number.isInteger(value) && value !== item.value) changes[item.key] = value;
  }
  return changes;
}

export const AI_SETTING_ORDER = [
  "aiCozumAktifMi",
  "aiGunlukCozumLimit",
  "aiGunlukCozumLimitModerator",
  "aiGunlukCozumGlobalLimit",
  "aiOkunamadiBeklemeSaat",
  "aiSoruDogrulamaAktifMi",
  "soruUretimAktifMi",
  "soruCarpani",
] as const;

const settingLabels: Record<string, { label: string; hint: string; toggle?: boolean }> = {
  aiCozumAktifMi: { label: "Yapay Zekâ Çözümü Açık", hint: "Kapalıyken öğrenciler çözüm isteyemez.", toggle: true },
  aiGunlukCozumLimit: { label: "Öğrenci Günlük Çözüm Hakkı", hint: "Her öğrencinin günde isteyebileceği çözüm sayısı." },
  aiGunlukCozumLimitModerator: { label: "Öğretmen/Müdür Günlük Çözüm Hakkı", hint: "0 girilirse kişisel limit uygulanmaz." },
  aiGunlukCozumGlobalLimit: { label: "Genel Günlük Çözüm Limiti", hint: "Tüm kullanıcıların toplam günlük çözüm sayısı." },
  aiOkunamadiBeklemeSaat: { label: "Okunamayan Soru Bekleme Süresi (Saat)", hint: "Görseli okunamayan soru bu süre boyunca yeniden denenmez." },
  aiSoruDogrulamaAktifMi: { label: "Üretilen Soruları İkinci Kez Doğrula", hint: "Açıkken üretilen her soru ayrı bir çağrıyla doğrulanır.", toggle: true },
  soruUretimAktifMi: { label: "Günlük Soru Üretimi Açık", hint: "Kapalıyken zamanlayıcı yeni soru üretmez.", toggle: true },
  soruCarpani: { label: "Soru Çarpanı", hint: "Günlük soru hedefinin çarpanı." },
};

export function aiSettingInfo(key: string): { label: string; hint: string; toggle: boolean } {
  const info = settingLabels[key];
  return { label: info?.label ?? key, hint: info?.hint ?? "", toggle: info?.toggle ?? false };
}

export function orderSettings<T extends { key: string }>(items: T[]): T[] {
  const rank = (key: string) => {
    const index = (AI_SETTING_ORDER as readonly string[]).indexOf(key);
    return index === -1 ? AI_SETTING_ORDER.length : index;
  };
  return [...items].sort((a, b) => rank(a.key) - rank(b.key));
}

export interface DaySummary {
  date: string;
  calls: number;
  succeeded: number;
  failed: number;
  rejected: number;
  costUsd: number;
}

export function summarizeDays(
  rows: { date: string; calls: number; succeeded: number; failed: number; rejected: number; costUsd: number }[],
): DaySummary[] {
  const byDate = new Map<string, DaySummary>();
  for (const row of rows) {
    const day = byDate.get(row.date) ?? { date: row.date, calls: 0, succeeded: 0, failed: 0, rejected: 0, costUsd: 0 };
    day.calls += row.calls;
    day.succeeded += row.succeeded;
    day.failed += row.failed;
    day.rejected += row.rejected;
    day.costUsd += row.costUsd;
    byDate.set(row.date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
