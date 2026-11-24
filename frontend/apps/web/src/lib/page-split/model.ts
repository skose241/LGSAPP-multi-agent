import { OPTION_LETTERS } from "@lgs/api";
import { sortReadingOrder, type Rect } from "./geometry";

export interface SplitBox {
  id: string;
  page: number;
  rect: Rect;
  option: string | undefined;
  transferred: boolean;
}

export const MAX_PDF_PAGES = 60;
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const MAX_PHOTO_PAGES = 20;
export const BATCH_SIZE = 20;

let counter = 0;

export function newBoxId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}${counter.toString(36)}`;
}

export function readingOrder(boxes: readonly SplitBox[]): SplitBox[] {
  const pages = [...new Set(boxes.map((box) => box.page))].sort((a, b) => a - b);
  return pages.flatMap((page) => sortReadingOrder(boxes.filter((box) => box.page === page)));
}

export function numberFor(boxes: readonly SplitBox[], id: string, startNumber = 1): number {
  const index = readingOrder(boxes).findIndex((box) => box.id === id);
  return index < 0 ? 0 : startNumber + index;
}

export function applyAnswers(boxes: readonly SplitBox[], answers: ReadonlyMap<number, string>, startNumber = 1): { boxes: SplitBox[]; applied: number; unmatched: number[] } {
  const ordered = readingOrder(boxes);
  const byId = new Map<string, string>();
  const matched = new Set<number>();
  ordered.forEach((box, index) => {
    const number = startNumber + index;
    const letter = answers.get(number);
    if (letter) {
      byId.set(box.id, letter);
      matched.add(number);
    }
  });
  const unmatched = [...answers.keys()].filter((number) => !matched.has(number)).sort((a, b) => a - b);
  return { boxes: boxes.map((box) => (byId.has(box.id) ? { ...box, option: byId.get(box.id) } : box)), applied: byId.size, unmatched };
}

export function pendingBoxes(boxes: readonly SplitBox[]): SplitBox[] {
  return readingOrder(boxes.filter((box) => !box.transferred));
}

export function canMerge(first: SplitBox, second: SplitBox): boolean {
  return first.page === second.page && !first.transferred && !second.transferred;
}

export function isOption(value: unknown): value is string {
  return typeof value === "string" && (OPTION_LETTERS as readonly string[]).includes(value);
}

export function cropFileName(page: number, number: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `sayfa-${pad(page + 1)}-soru-${pad(number)}.jpg`;
}
