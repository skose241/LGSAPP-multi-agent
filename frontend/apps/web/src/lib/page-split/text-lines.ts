import type { TextFragment } from "@/lib/pdf/text-content";

export const PAGE_ASPECT = 0.707;
const MIN_HEIGHT = 0.004;

export interface TextRow {
  x: number;
  y: number;
  right: number;
  bottom: number;
  height: number;
  text: string;
  fragments: TextFragment[];
}

function heightOf(fragment: TextFragment): number {
  return Math.max(fragment.h, MIN_HEIGHT);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function joinFragments(fragments: readonly TextFragment[]): string {
  let text = "";
  let previous: TextFragment | null = null;
  for (const fragment of fragments) {
    if (previous) {
      const gap = (fragment.x - (previous.x + previous.w)) * PAGE_ASPECT;
      const spaced = /\s$/.test(text) || /^\s/.test(fragment.str);
      if (!spaced && gap > 0.12 * heightOf(previous)) text += " ";
    }
    text += fragment.str;
    previous = fragment;
  }
  return text.replace(/\s+/g, " ").trim();
}

function buildRow(fragments: TextFragment[]): TextRow {
  const sorted = [...fragments].sort((a, b) => a.x - b.x);
  return {
    x: Math.min(...sorted.map((fragment) => fragment.x)),
    y: Math.min(...sorted.map((fragment) => fragment.y)),
    right: Math.max(...sorted.map((fragment) => fragment.x + fragment.w)),
    bottom: Math.max(...sorted.map((fragment) => fragment.y + fragment.h)),
    height: median(sorted.map(heightOf)),
    text: joinFragments(sorted),
    fragments: sorted,
  };
}

export function groupRows(fragments: readonly TextFragment[]): TextRow[] {
  const usable = fragments.filter((fragment) => fragment.str.trim() !== "" && fragment.w > 0 && fragment.h > 0);
  const sorted = [...usable].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const groups: { center: number; height: number; items: TextFragment[] }[] = [];
  for (const fragment of sorted) {
    const center = fragment.y + fragment.h / 2;
    const last = groups[groups.length - 1];
    if (last && Math.abs(center - last.center) <= 0.5 * Math.min(heightOf(fragment), last.height)) {
      last.items.push(fragment);
      last.center = last.items.reduce((sum, item) => sum + item.y + item.h / 2, 0) / last.items.length;
      last.height = Math.min(last.height, heightOf(fragment));
    } else {
      groups.push({ center, height: heightOf(fragment), items: [fragment] });
    }
  }
  return groups.map((group) => buildRow(group.items)).sort((a, b) => a.y - b.y || a.x - b.x);
}

const NUMBER_FRAGMENT = /^\d{1,3}[.)]$/u;
const MARGIN_SPLIT_TOLERANCE = 0.012;
const MARGIN_SPLIT_GAP = 0.012;

function startsAtMargin(fragment: TextFragment, previous: TextFragment, splitAt: readonly number[]): boolean {
  if (!NUMBER_FRAGMENT.test(fragment.str.trim())) return false;
  if (fragment.x - (previous.x + previous.w) < MARGIN_SPLIT_GAP) return false;
  return splitAt.some((margin) => Math.abs(fragment.x - margin) <= MARGIN_SPLIT_TOLERANCE);
}

export interface LineOptions {
  splitAt?: readonly number[];
}

export function splitRow(row: TextRow, options: LineOptions = {}): TextRow[] {
  const parts: TextFragment[][] = [];
  let current: TextFragment[] = [];
  let previous: TextFragment | null = null;
  const threshold = Math.max(1.8 * row.height, 0.012);
  const splitAt = options.splitAt ?? [];
  for (const fragment of row.fragments) {
    if (previous && ((fragment.x - (previous.x + previous.w)) * PAGE_ASPECT > threshold || startsAtMargin(fragment, previous, splitAt))) {
      parts.push(current);
      current = [];
    }
    current.push(fragment);
    previous = fragment;
  }
  if (current.length > 0) parts.push(current);
  return parts.map(buildRow).filter((part) => part.text !== "");
}

export function toLines(fragments: readonly TextFragment[], options: LineOptions = {}): TextRow[] {
  return groupRows(fragments)
    .flatMap((row) => splitRow(row, options))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function foldText(text: string): string {
  return text.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
}
