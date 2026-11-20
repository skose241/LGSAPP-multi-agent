import type { ReportItem, ReportReasonFilter, ReportStatusValue, ReportTargetTypeValue, ReportResolveActionValue } from "@lgs/api/queries";

export interface ReportFilters {
  status: ReportStatusValue | "all";
  targetType: ReportTargetTypeValue | "all";
  page: number;
}

export const DEFAULT_REPORT_STATUS: ReportStatusValue = "pending";

export const REPORT_STATUS_OPTIONS: { value: ReportFilters["status"]; label: string }[] = [
  { value: "pending", label: "Bekleyen" },
  { value: "resolved", label: "İşlem Yapılan" },
  { value: "rejected", label: "Reddedilen" },
  { value: "all", label: "Tümü" },
];

export const REPORT_TARGET_OPTIONS: { value: ReportFilters["targetType"]; label: string }[] = [
  { value: "all", label: "Tüm Türler" },
  { value: "question", label: "Soru" },
  { value: "solution", label: "Çözüm" },
  { value: "comment", label: "Yorum" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  resolved: "İşlem Yapıldı",
  rejected: "Reddedildi",
};

const TARGET_LABELS: Record<string, string> = {
  question: "Soru",
  solution: "Çözüm",
  comment: "Yorum",
};

const ACTION_LABELS: Record<string, string> = {
  none: "İşlem Yapılmadı",
  contentHidden: "İçerik Gizlendi",
  answerKeyChanged: "Cevap Anahtarı Değiştirildi",
  userBanned: "Kullanıcı Engellendi",
};

export function reportStatusLabel(value: string): string {
  return STATUS_LABELS[value] ?? "Bilinmiyor";
}

export function reportTargetLabel(value: string): string {
  return TARGET_LABELS[value] ?? "Hedef";
}

export function reportActionLabel(value: string): string {
  return ACTION_LABELS[value] ?? "İşlem";
}

function positiveInt(value: string | null): number {
  if (!value || !/^[0-9]{1,6}$/.test(value)) return 1;
  const parsed = Number(value);
  return parsed > 0 ? parsed : 1;
}

export function parseReportFilters(params: URLSearchParams): ReportFilters {
  const durum = params.get("durum");
  const tur = params.get("tur");
  const status = REPORT_STATUS_OPTIONS.find((entry) => entry.value === durum)?.value ?? DEFAULT_REPORT_STATUS;
  const targetType = REPORT_TARGET_OPTIONS.find((entry) => entry.value === tur)?.value ?? "all";
  return { status, targetType, page: positiveInt(params.get("sayfa")) };
}

export function reportFiltersToSearch(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== DEFAULT_REPORT_STATUS) params.set("durum", filters.status);
  if (filters.targetType !== "all") params.set("tur", filters.targetType);
  if (filters.page > 1) params.set("sayfa", String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export interface ResolveChoice {
  value: ReportResolveActionValue;
  label: string;
  description: string;
  tone: "primary" | "danger";
}

export function resolveChoices(input: {
  targetType: string;
  isMudur: boolean;
}): ResolveChoice[] {
  const choices: ResolveChoice[] = [
    { value: "reject", label: "Şikâyeti Reddet", description: "Herhangi bir işlem yapılmaz, şikâyet eden bilgilendirilir.", tone: "primary" },
    { value: "hideContent", label: "İçeriği Gizle", description: "İçerik öğrencilere gösterilmez.", tone: "danger" },
  ];
  if (input.targetType === "question") {
    choices.push({ value: "changeAnswerKey", label: "Cevap Anahtarını Değiştir", description: "Soruyu cevaplayan öğrencilerin sonucu ve puanı yeniden hesaplanır.", tone: "primary" });
  }
  if (input.isMudur) {
    choices.push({ value: "banUser", label: "Kullanıcıyı Engelle", description: "İçerik sahibinin hesabı engellenir.", tone: "danger" });
  }
  return choices;
}

export function isWrongAnswerKey(reason: ReportReasonFilter | string): boolean {
  return reason === "wrongAnswerKey";
}

export const REPORT_PAGE_SIZE = 20;
export const REPORT_NOTE_MAX = 500;

export function userLabel(user: ReportItem["reporter"]): string {
  return user ? user.fullName || user.userName : "Bilinmiyor";
}
