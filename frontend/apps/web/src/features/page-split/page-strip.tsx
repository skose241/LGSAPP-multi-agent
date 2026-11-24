"use client";

import { useEffect, useRef, useState } from "react";
import type { Rotation } from "@/lib/page-split/geometry";
import type { PageSource } from "@/lib/page-split/sources";
import { cn } from "@/lib/utils";
import { usePagePreview } from "./use-page-source";

interface ThumbProps {
  source: PageSource;
  page: number;
  rotation: Rotation;
  active: boolean;
  count: number;
  onSelect: () => void;
}

function Thumb({ source, page, rotation, active, count, onSelect }: ThumbProps) {
  const holder = useRef<HTMLButtonElement | null>(null);
  const [visible, setVisible] = useState(false);
  const size = source.pageSize(page);
  const swapped = rotation === 90 || rotation === 270;
  const aspect = swapped ? size.height / size.width : size.width / size.height;
  const preview = usePagePreview(source, page, rotation, 200, visible);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={holder}
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      data-testid="page-thumb"
      data-page={page}
      className={cn("relative flex w-24 shrink-0 flex-col items-center gap-1 rounded-md border-2 bg-surface p-1 lg:w-full", active ? "border-primary" : "border-border")}
    >
      <span className="block w-full overflow-hidden rounded bg-surface-muted" style={{ aspectRatio: String(aspect) }}>
        {preview.url ? <img src={preview.url} alt="" draggable={false} className="size-full object-contain" /> : null}
      </span>
      <span className="text-xs font-semibold">
        <span className="sr-only">Sayfa </span>
        {page + 1}
      </span>
      {count > 0 ? (
        <span className="absolute right-1 top-1 rounded-pill bg-primary px-1.5 text-xs font-bold text-primary-foreground">
          {count}
          <span className="sr-only"> çerçeve</span>
        </span>
      ) : null}
    </button>
  );
}

interface PageStripProps {
  source: PageSource;
  current: number;
  rotations: Record<number, Rotation>;
  counts: number[];
  onSelect: (page: number) => void;
}

export function PageStrip({ source, current, rotations, counts, onSelect }: PageStripProps) {
  return (
    <nav aria-label="Sayfalar" className="flex gap-2 overflow-x-auto pb-1 lg:max-h-[75dvh] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0" data-testid="page-strip">
      {Array.from({ length: source.pageCount }, (_, page) => (
        <Thumb key={page} source={source} page={page} rotation={rotations[page] ?? 0} active={page === current} count={counts[page] ?? 0} onSelect={() => onSelect(page)} />
      ))}
    </nav>
  );
}
