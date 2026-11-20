"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow, type PageSlice } from "@/lib/admin/pagination";
import { cn } from "@/lib/utils";

interface PaginationProps {
  slice: Pick<PageSlice<unknown>, "page" | "pageCount" | "from" | "to" | "total">;
  onPageChange: (page: number) => void;
}

const buttonClasses =
  "inline-flex min-h-touch min-w-touch items-center justify-center rounded-md border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function Pagination({ slice, onPageChange }: PaginationProps) {
  const { page, pageCount, from, to, total } = slice;

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted-foreground" data-testid="page-info">
        {from}–{to} / {total}
      </p>
      {pageCount > 1 ? (
        <nav aria-label="Sayfalama">
          <ul className="flex flex-wrap items-center justify-center gap-1.5">
            <li>
              <button
                type="button"
                className={cn(buttonClasses, "border-border-strong bg-surface hover:bg-surface-muted")}
                disabled={page === 1}
                onClick={() => onPageChange(page - 1)}
                aria-label="Önceki Sayfa"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
            </li>
            {pageWindow(page, pageCount).map((token) =>
              typeof token === "number" ? (
                <li key={token}>
                  <button
                    type="button"
                    onClick={() => onPageChange(token)}
                    aria-label={`Sayfa ${token}`}
                    aria-current={token === page ? "page" : undefined}
                    className={cn(
                      buttonClasses,
                      token === page
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border-strong bg-surface hover:bg-surface-muted",
                    )}
                  >
                    {token}
                  </button>
                </li>
              ) : (
                <li key={token} aria-hidden="true" className="px-1 text-muted-foreground">
                  …
                </li>
              ),
            )}
            <li>
              <button
                type="button"
                className={cn(buttonClasses, "border-border-strong bg-surface hover:bg-surface-muted")}
                disabled={page === pageCount}
                onClick={() => onPageChange(page + 1)}
                aria-label="Sonraki Sayfa"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
