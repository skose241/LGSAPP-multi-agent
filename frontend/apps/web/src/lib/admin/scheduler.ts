import type { SchedulerKind, SchedulerRun } from "@lgs/api/queries";

export const RUN_PAGE_SIZE = 20;

export const SCHEDULER_KINDS: SchedulerKind[] = ["generate", "complete", "publish", "assignments"];

const KIND_LABELS: Record<string, string> = {
  generate: "Soru Üretimi",
  complete: "Soru Tamamlama",
  publish: "Soru Yayınlama",
  assignments: "Ödev Kapatma",
};

const STATUS_LABELS: Record<string, string> = {
  running: "Çalışıyor",
  succeeded: "Başarılı",
  partiallySucceeded: "Kısmen Başarılı",
  failed: "Başarısız",
  interrupted: "Yarıda Kesildi",
};

const TRIGGER_LABELS: Record<string, string> = {
  timer: "Zamanlayıcı",
  manual: "Elle",
};

const LOG_STATUS_LABELS: Record<string, string> = {
  success: "Başarılı",
  failed: "Hatalı",
  skipped: "Atlandı",
};

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? "Görev";
}

export function runStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? "Bilinmiyor";
}

export function triggerLabel(trigger: string): string {
  return TRIGGER_LABELS[trigger] ?? "Bilinmiyor";
}

export function logStatusLabel(status: string): string {
  return LOG_STATUS_LABELS[status] ?? "Bilinmiyor";
}

export function runStatusTone(status: string): StatusTone {
  if (status === "succeeded") return "success";
  if (status === "partiallySucceeded") return "warning";
  if (status === "failed") return "danger";
  if (status === "running") return "info";
  return "neutral";
}

export function logStatusTone(status: string): StatusTone {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

export function isRunning(run: Pick<SchedulerRun, "status"> | null | undefined): boolean {
  return run?.status === "running";
}

export function consumesQuota(kind: SchedulerKind): boolean {
  return kind === "generate" || kind === "complete";
}

export function confirmCopy(kind: SchedulerKind): { title: string; description: string; confirmLabel: string } {
  const name = kindLabel(kind);
  if (kind === "generate" || kind === "complete") {
    return {
      title: `${name.charAt(0)}${name.slice(1).toLocaleLowerCase("tr-TR")} şimdi çalıştırılsın mı?`,
      description: "Bu görev Gemini kotası tüketir. Bugünkü ders programına göre yapay zekâdan soru istenir.",
      confirmLabel: "Şimdi Çalıştır",
    };
  }
  if (kind === "publish") {
    return {
      title: "Sorular şimdi yayınlansın mı?",
      description: "Bugünün planlı soruları hemen yayına alınır ve öğrencilere görünür olur.",
      confirmLabel: "Şimdi Yayınla",
    };
  }
  return {
    title: "Ödevler şimdi kapatılsın mı?",
    description: "Süresi dolan ödevler kapatılır.",
    confirmLabel: "Şimdi Kapat",
  };
}

export interface RunFilters {
  kind: SchedulerKind | "all";
  status: string;
  from: string;
  to: string;
  page: number;
}

export const RUN_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tüm Durumlar" },
  { value: "running", label: "Çalışıyor" },
  { value: "succeeded", label: "Başarılı" },
  { value: "partiallySucceeded", label: "Kısmen Başarılı" },
  { value: "failed", label: "Başarısız" },
  { value: "interrupted", label: "Yarıda Kesildi" },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | null): string {
  if (!value || !DATE_PATTERN.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? "" : value;
}

export function parseRunFilters(params: URLSearchParams): RunFilters {
  const kind = params.get("tur");
  const status = params.get("durum");
  const page = params.get("sayfa");
  return {
    kind: SCHEDULER_KINDS.find((entry) => entry === kind) ?? "all",
    status: RUN_STATUS_OPTIONS.find((entry) => entry.value === status)?.value ?? "all",
    from: validDate(params.get("baslangic")),
    to: validDate(params.get("bitis")),
    page: page && /^[0-9]{1,6}$/.test(page) && Number(page) > 0 ? Number(page) : 1,
  };
}

export function runFiltersToSearch(filters: RunFilters): string {
  const params = new URLSearchParams();
  if (filters.kind !== "all") params.set("tur", filters.kind);
  if (filters.status !== "all") params.set("durum", filters.status);
  if (filters.from) params.set("baslangic", filters.from);
  if (filters.to) params.set("bitis", filters.to);
  if (filters.page > 1) params.set("sayfa", String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function runFiltersToQuery(filters: RunFilters) {
  return {
    kind: filters.kind === "all" ? undefined : filters.kind,
    status: filters.status === "all" ? undefined : filters.status,
    from: filters.from || undefined,
    to: filters.to || undefined,
    page: filters.page,
    pageSize: RUN_PAGE_SIZE,
  };
}

export function runCounts(run: Pick<SchedulerRun, "succeededCount" | "failedCount">): string {
  return `${run.succeededCount} başarılı, ${run.failedCount} hatalı`;
}
