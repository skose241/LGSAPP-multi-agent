export const PAGE_SIZE = 25;

export interface PageSlice<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
}

export function paginate<T>(items: T[], requestedPage: number, size: number = PAGE_SIZE): PageSlice<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pageCount);
  const start = (page - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}

export type PageToken = number | "gap-start" | "gap-end";

export function pageWindow(page: number, pageCount: number, radius = 1): PageToken[] {
  if (pageCount <= 5 + radius * 2) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const tokens: PageToken[] = [1];
  const start = Math.max(2, page - radius);
  const end = Math.min(pageCount - 1, page + radius);
  if (start > 2) tokens.push("gap-start");
  for (let value = start; value <= end; value += 1) tokens.push(value);
  if (end < pageCount - 1) tokens.push("gap-end");
  tokens.push(pageCount);
  return tokens;
}
