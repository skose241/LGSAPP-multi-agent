import type { AnsweredFilter } from "@lgs/api/queries";

export type SourceFilter = "teacher" | "student" | "ai";

export interface QuestionFilters {
  lessonId?: number;
  topicId?: number;
  source?: SourceFilter;
  answered: AnsweredFilter;
  page: number;
}

export const DEFAULT_ANSWERED: AnsweredFilter = "unanswered";

const ANSWERED_PARAM: Record<AnsweredFilter, string> = {
  unanswered: "cozulmedi",
  answered: "cozuldu",
  all: "tumu",
};

function positiveInt(value: string | null): number | undefined {
  if (!value || !/^[0-9]{1,9}$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}

export function parseFilters(params: URLSearchParams): QuestionFilters {
  const durum = params.get("durum");
  const answered =
    (Object.keys(ANSWERED_PARAM) as AnsweredFilter[]).find((key) => ANSWERED_PARAM[key] === durum) ?? DEFAULT_ANSWERED;
  const kaynak = params.get("kaynak");
  const source = kaynak === "teacher" || kaynak === "student" || kaynak === "ai" ? kaynak : undefined;
  const lessonId = positiveInt(params.get("ders"));
  return {
    lessonId,
    topicId: lessonId ? positiveInt(params.get("konu")) : undefined,
    source,
    answered,
    page: positiveInt(params.get("sayfa")) ?? 1,
  };
}

export function filtersToSearch(filters: QuestionFilters): string {
  const params = new URLSearchParams();
  if (filters.lessonId) params.set("ders", String(filters.lessonId));
  if (filters.lessonId && filters.topicId) params.set("konu", String(filters.topicId));
  if (filters.source) params.set("kaynak", filters.source);
  if (filters.answered !== DEFAULT_ANSWERED) params.set("durum", ANSWERED_PARAM[filters.answered]);
  if (filters.page > 1) params.set("sayfa", String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}
