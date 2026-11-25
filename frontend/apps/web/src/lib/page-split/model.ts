import { OPTION_LETTERS } from "@lgs/api";
import { sortReadingOrder, type Rect } from "./geometry";

export interface SplitBox {
  id: string;
  page: number;
  rect: Rect;
  option: string | undefined;
  transferred: boolean;
  source?: "text";
  suggested?: boolean;
  detectedNumber?: number;
  section?: string;
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

export function boxNumber(box: SplitBox, index: number, startNumber: number): number {
  return box.source === "text" && box.detectedNumber !== undefined ? box.detectedNumber : startNumber + index;
}

export function numberingOf(boxes: readonly SplitBox[], startNumber = 1): Map<string, number> {
  const result = new Map<string, number>();
  readingOrder(boxes).forEach((box, index) => result.set(box.id, boxNumber(box, index, startNumber)));
  return result;
}

export function boxLabel(box: SplitBox, number: number): string {
  return `${box.section ?? "Soru"} ${number}`;
}

export interface SectionKeyInput {
  name: string | null;
  answers: ReadonlyMap<number, string>;
}

export function applySectionKeys(boxes: readonly SplitBox[], sections: readonly SectionKeyInput[]): { boxes: SplitBox[]; applied: number; unmatched: { name: string | null; numbers: number[] }[] } {
  const matched = new Map<SectionKeyInput, Set<number>>(sections.map((section) => [section, new Set<number>()]));
  const hasBoxes = new Set<SectionKeyInput>();
  let applied = 0;
  const next = boxes.map((box) => {
    if (box.source !== "text" || box.detectedNumber === undefined) return box;
    const key = sections.length === 1 ? sections[0] : sections.find((section) => section.name === (box.section ?? null));
    if (!key) return box;
    hasBoxes.add(key);
    const letter = key.answers.get(box.detectedNumber);
    if (!letter) return box;
    matched.get(key)?.add(box.detectedNumber);
    applied += 1;
    return { ...box, option: letter };
  });
  const unmatched = sections
    .filter((section) => hasBoxes.has(section))
    .map((section) => ({ name: section.name, numbers: [...section.answers.keys()].filter((number) => !matched.get(section)?.has(number)).sort((a, b) => a - b) }))
    .filter((entry) => entry.numbers.length > 0);
  return { boxes: next, applied, unmatched };
}

export function numberFor(boxes: readonly SplitBox[], id: string, startNumber = 1): number {
  return numberingOf(boxes, startNumber).get(id) ?? 0;
}

export function applyAnswers(boxes: readonly SplitBox[], answers: ReadonlyMap<number, string>, startNumber = 1): { boxes: SplitBox[]; applied: number; unmatched: number[] } {
  const ordered = readingOrder(boxes);
  const byId = new Map<string, string>();
  const matched = new Set<number>();
  ordered.forEach((box, index) => {
    const number = boxNumber(box, index, startNumber);
    const letter = answers.get(number);
    if (letter) {
      byId.set(box.id, letter);
      matched.add(number);
    }
  });
  const unmatched = [...answers.keys()].filter((number) => !matched.has(number)).sort((a, b) => a - b);
  return { boxes: boxes.map((box) => (byId.has(box.id) ? { ...box, option: byId.get(box.id) } : box)), applied: byId.size, unmatched };
}

export function confirmedBoxes(boxes: readonly SplitBox[]): SplitBox[] {
  return boxes.filter((box) => !box.suggested);
}

export function suggestedBoxes(boxes: readonly SplitBox[]): SplitBox[] {
  return boxes.filter((box) => box.suggested === true);
}

export function acceptSuggestions(boxes: readonly SplitBox[]): SplitBox[] {
  return boxes.map((box) => (box.suggested ? { ...box, suggested: false } : box));
}

export function rejectSuggestions(boxes: readonly SplitBox[]): SplitBox[] {
  return confirmedBoxes(boxes);
}

export function pendingBoxes(boxes: readonly SplitBox[]): SplitBox[] {
  return readingOrder(boxes.filter((box) => !box.transferred && !box.suggested));
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
