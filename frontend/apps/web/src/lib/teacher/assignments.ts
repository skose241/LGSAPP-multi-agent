import { addDaysToDateOnly, isDateOnly } from "@lgs/api";
import type { AssignmentState, ResultsSort, SortDirection } from "@lgs/api/queries";

export type AssignmentTab = AssignmentState;

export const ASSIGNMENT_TABS: { value: AssignmentTab; param: string; label: string }[] = [
  { value: "draft", param: "taslak", label: "Taslak" },
  { value: "scheduled", param: "planli", label: "Planlı" },
  { value: "open", param: "acik", label: "Açık" },
  { value: "closed", param: "kapandi", label: "Kapandı" },
];

export const DEFAULT_ASSIGNMENT_TAB: AssignmentTab = "open";

export interface AssignmentFilters {
  tab: AssignmentTab;
  lessonId?: number;
  mine: boolean;
  page: number;
}

function positiveInt(value: string | null): number | undefined {
  if (!value || !/^[0-9]{1,9}$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}

export function parseAssignmentFilters(params: URLSearchParams): AssignmentFilters {
  const tab = ASSIGNMENT_TABS.find((entry) => entry.param === params.get("durum"))?.value ?? DEFAULT_ASSIGNMENT_TAB;
  return {
    tab,
    lessonId: positiveInt(params.get("ders")),
    mine: params.get("benim") === "1",
    page: positiveInt(params.get("sayfa")) ?? 1,
  };
}

export function assignmentFiltersToSearch(filters: AssignmentFilters): string {
  const params = new URLSearchParams();
  if (filters.tab !== DEFAULT_ASSIGNMENT_TAB) {
    const entry = ASSIGNMENT_TABS.find((item) => item.value === filters.tab);
    if (entry) params.set("durum", entry.param);
  }
  if (filters.lessonId) params.set("ders", String(filters.lessonId));
  if (filters.mine) params.set("benim", "1");
  if (filters.page > 1) params.set("sayfa", String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function stateLabel(state: string): string {
  return ASSIGNMENT_TABS.find((entry) => entry.value === state)?.label ?? "Bilinmiyor";
}

export type StateTone = "neutral" | "info" | "success" | "warning";

export function stateTone(state: string): StateTone {
  if (state === "open") return "success";
  if (state === "scheduled") return "info";
  if (state === "draft") return "warning";
  return "neutral";
}

export function dayDiff(from: string, to: string): number {
  if (!isDateOnly(from) || !isDateOnly(to)) return 0;
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function remainingLabel(state: string, startDate: string, endDate: string, today: string): string {
  if (state === "closed") return "Kapandı";
  if (state === "draft") return "Henüz yayınlanmadı";
  if (state === "scheduled") {
    const until = dayDiff(today, startDate);
    return until <= 1 ? "Yarın başlar" : `${until} gün sonra başlar`;
  }
  const left = dayDiff(today, endDate);
  if (left <= 0) return "Son gün bugün";
  if (left === 1) return "Son gün yarın";
  return `${left} gün kaldı`;
}

export function progressPercent(answered: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((answered / total) * 100)));
}

export function percentOfRate(rate: number): string {
  return `%${Math.round(rate * 100)}`;
}

export interface AssignmentFormValues {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
}

export interface AssignmentFormErrors {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}

export const ASSIGNMENT_MAX_RANGE_DAYS = 60;
export const ASSIGNMENT_FUTURE_LIMIT_MESSAGE = "Ödev tarihleri bugünden en fazla 1 yıl sonrası olabilir.";

export function assignmentDateLimit(today: string): string {
  if (!isDateOnly(today)) return today;
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  const dd = String(Math.min(day, lastDay)).padStart(2, "0");
  return `${year + 1}-${mm}-${dd}`;
}

export interface DateValidationOptions {
  today?: string;
  allowPastStart?: boolean;
}

export function validateAssignmentDates(values: Pick<AssignmentFormValues, "startDate" | "endDate">, options: DateValidationOptions = {}): AssignmentFormErrors {
  const errors: AssignmentFormErrors = {};
  if (!isDateOnly(values.startDate)) errors.startDate = "Başlangıç tarihini seç.";
  if (!isDateOnly(values.endDate)) errors.endDate = "Bitiş tarihini seç.";
  if (errors.startDate || errors.endDate) return errors;

  const today = options.today && isDateOnly(options.today) ? options.today : null;
  if (today && !options.allowPastStart && values.startDate < today) {
    errors.startDate = "Başlangıç tarihi bugünden önce olamaz.";
    return errors;
  }
  if (today) {
    const limit = assignmentDateLimit(today);
    if (values.startDate > limit) {
      errors.startDate = ASSIGNMENT_FUTURE_LIMIT_MESSAGE;
      return errors;
    }
    if (values.endDate > limit) {
      errors.endDate = ASSIGNMENT_FUTURE_LIMIT_MESSAGE;
      return errors;
    }
  }
  if (values.endDate < values.startDate) {
    errors.endDate = "Bitiş tarihi başlangıç tarihinden önce olamaz.";
    return errors;
  }
  if (dayDiff(values.startDate, values.endDate) + 1 > ASSIGNMENT_MAX_RANGE_DAYS) {
    errors.endDate = `Ödev süresi en fazla ${ASSIGNMENT_MAX_RANGE_DAYS} gün olabilir.`;
  }
  return errors;
}

export function bindServerFormProblem(
  problem: { message: string; fieldErrors: Record<string, string[]> },
  values: Pick<AssignmentFormValues, "startDate" | "endDate">,
  today: string,
): AssignmentFormErrors | null {
  const text = problem.message;
  if (!text) return null;
  const errors: AssignmentFormErrors = {};
  if (text === ASSIGNMENT_FUTURE_LIMIT_MESSAGE) {
    const limit = assignmentDateLimit(today);
    if (values.startDate > limit) errors.startDate = text;
    else errors.endDate = text;
    return errors;
  }
  if (/^Başlangıç tarihi|^Başlamış ödevin başlangıç/.test(text)) errors.startDate = text;
  else if (/^Bitiş tarihi|^Başlamış ödevin bitiş|^Ödev süresi/.test(text)) errors.endDate = text;
  else if (/^Başlık/.test(text)) errors.title = text;
  else if (/^Açıklama/.test(text)) errors.description = text;
  else return null;
  return errors;
}

export function defaultAssignmentDates(today: string): { startDate: string; endDate: string } {
  return { startDate: today, endDate: addDaysToDateOnly(today, 6) };
}

export function moveId(ids: readonly number[], id: number, direction: "up" | "down"): number[] | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  const moved = next[index];
  const swapped = next[target];
  if (moved === undefined || swapped === undefined) return null;
  next[index] = swapped;
  next[target] = moved;
  return next;
}

export type Participation = "completed" | "partial" | "missed" | "notStarted" | "empty";

export function participationOf(answered: number, total: number, state: string): Participation {
  if (total <= 0) return "empty";
  if (answered >= total) return "completed";
  if (answered > 0) return "partial";
  return state === "closed" ? "missed" : "notStarted";
}

const participationLabels: Record<Participation, string> = {
  completed: "Tamamladı",
  partial: "Kısmi",
  missed: "Kaçırdı",
  notStarted: "Başlamadı",
  empty: "Soru yok",
};

export function participationLabel(value: Participation): string {
  return participationLabels[value];
}

export function participationTone(value: Participation): "success" | "info" | "danger" | "neutral" {
  if (value === "completed") return "success";
  if (value === "partial") return "info";
  if (value === "missed") return "danger";
  return "neutral";
}

export const RESULT_SORTS: { value: ResultsSort; param: string; label: string; dir: SortDirection }[] = [
  { value: "completion", param: "katilim", label: "Katılıma göre", dir: "desc" },
  { value: "name", param: "ad", label: "Ada göre", dir: "asc" },
  { value: "correct", param: "dogru", label: "Doğru sayısına göre", dir: "desc" },
  { value: "lastAnswered", param: "son", label: "Son cevaba göre", dir: "desc" },
];

export interface ResultsView {
  sort: ResultsSort;
  page: number;
}

export function parseResultsView(params: URLSearchParams): ResultsView {
  const entry = RESULT_SORTS.find((item) => item.param === params.get("sirala")) ?? RESULT_SORTS[0]!;
  return { sort: entry.value, page: positiveInt(params.get("sayfa")) ?? 1 };
}

export function resultsViewToSearch(view: ResultsView): string {
  const params = new URLSearchParams();
  const entry = RESULT_SORTS.find((item) => item.value === view.sort);
  if (entry && entry.value !== "completion") params.set("sirala", entry.param);
  if (view.page > 1) params.set("sayfa", String(view.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function sortDirection(sort: ResultsSort): SortDirection {
  return RESULT_SORTS.find((item) => item.value === sort)?.dir ?? "desc";
}

export function findAddedByImage<T extends { imageFileId: number | null }>(questions: readonly T[], fileId: number): T | undefined {
  return questions.find((question) => question.imageFileId === fileId);
}

export function questionsEditable(canModify: boolean, state: string): boolean {
  return canModify && (state === "draft" || state === "scheduled");
}

export function datesEditable(canModify: boolean, state: string): { start: boolean; end: boolean } {
  if (!canModify || state === "closed") return { start: false, end: false };
  return { start: state !== "open", end: true };
}

export function formatPublishNote(change: { state: string; notifiedCount?: number | null }): string {
  if (change.state === "open") {
    const count = change.notifiedCount ?? 0;
    return count > 0 ? `Ödev yayınlandı. ${count} öğrenciye bildirim gitti.` : "Ödev yayınlandı.";
  }
  if (change.state === "scheduled") return "Ödev planlandı. Başlangıç gününde öğrencilere açılacak.";
  return "Ödev güncellendi.";
}

export const ASSIGNMENT_BATCH_MAX = 20;
export const ASSIGNMENT_QUESTION_MAX = 200;

export function remainingCapacity(currentCount: number): number {
  return Math.max(0, ASSIGNMENT_QUESTION_MAX - currentCount);
}

export function toggleSelection(selected: readonly number[], id: number, limit: number): number[] {
  if (selected.includes(id)) return selected.filter((entry) => entry !== id);
  if (selected.length >= limit) return [...selected];
  return [...selected, id];
}
