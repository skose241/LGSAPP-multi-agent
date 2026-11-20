import type { StudentSort } from "@lgs/api/queries";

export interface StudentFilters {
  search: string;
  sort: StudentSort;
  page: number;
}

export const DEFAULT_STUDENT_SORT: StudentSort = "name";
export const SEARCH_MAX = 60;

export const STUDENT_SORTS: { value: StudentSort; param: string; label: string }[] = [
  { value: "name", param: "ad", label: "Ada Göre" },
  { value: "points", param: "puan", label: "Puana Göre" },
  { value: "answered", param: "cevap", label: "Cevap Sayısına Göre" },
  { value: "lastActive", param: "son", label: "Son Etkinliğe Göre" },
];

function positiveInt(value: string | null): number {
  if (!value || !/^[0-9]{1,6}$/.test(value)) return 1;
  const parsed = Number(value);
  return parsed > 0 ? parsed : 1;
}

export function parseStudentFilters(params: URLSearchParams): StudentFilters {
  const sortParam = params.get("sirala");
  const sort = STUDENT_SORTS.find((entry) => entry.param === sortParam)?.value ?? DEFAULT_STUDENT_SORT;
  return {
    search: (params.get("ara") ?? "").slice(0, SEARCH_MAX),
    sort,
    page: positiveInt(params.get("sayfa")),
  };
}

export function studentFiltersToSearch(filters: StudentFilters): string {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search) params.set("ara", search.slice(0, SEARCH_MAX));
  if (filters.sort !== DEFAULT_STUDENT_SORT) {
    const entry = STUDENT_SORTS.find((item) => item.value === filters.sort);
    if (entry) params.set("sirala", entry.param);
  }
  if (filters.page > 1) params.set("sayfa", String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function percentLabel(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? "-" : `%${Math.round(rate)}`;
}

export function pageSlice(page: number, pageSize: number, totalCount: number, itemCount: number) {
  return {
    page,
    pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
    from: totalCount === 0 ? 0 : (page - 1) * pageSize + 1,
    to: (page - 1) * pageSize + itemCount,
    total: totalCount,
  };
}

export function lastValidPage(page: number, pageSize: number, totalCount: number, itemCount: number): number | null {
  if (page <= 1 || itemCount > 0 || totalCount <= 0) return null;
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
