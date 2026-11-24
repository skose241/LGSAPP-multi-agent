import type { Rotation } from "./geometry";
import { isOption, type SplitBox } from "./model";

export const DRAFT_VERSION = 1;
export const DRAFT_MAX_CHARS = 200_000;
export const DRAFT_MAX_BOXES = 400;

export interface Draft {
  version: number;
  sourceKey: string;
  savedAt: number;
  pageCount: number;
  boxes: SplitBox[];
  rotations: Record<number, Rotation>;
}

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storageKey(scope: string): string {
  return `lgs.page-split.v${DRAFT_VERSION}:${scope}`;
}

function hash(text: string): string {
  let value = 5381;
  for (let index = 0; index < text.length; index += 1) {
    value = ((value << 5) + value + text.charCodeAt(index)) | 0;
  }
  return (value >>> 0).toString(36);
}

export function pdfSourceKey(fingerprint: string): string {
  return `pdf:${fingerprint}`;
}

export function photoSourceKey(files: readonly { name: string; size: number; lastModified: number }[]): string {
  return `img:${hash(files.map((file) => `${file.name}|${file.size}|${file.lastModified}`).join("\n"))}:${files.length}`;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeBox(value: unknown, pageCount: number): SplitBox | null {
  if (typeof value !== "object" || value === null) return null;
  const box = value as Record<string, unknown>;
  const rect = box.rect as Record<string, unknown> | undefined;
  if (typeof box.id !== "string" || !isNumber(box.page) || !rect) return null;
  if (!Number.isInteger(box.page) || box.page < 0 || box.page >= pageCount) return null;
  const { x, y, width, height } = rect;
  if (!isNumber(x) || !isNumber(y) || !isNumber(width) || !isNumber(height)) return null;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.0001 || y + height > 1.0001) return null;
  return {
    id: box.id,
    page: box.page,
    rect: { x, y, width, height },
    option: isOption(box.option) ? box.option : undefined,
    transferred: box.transferred === true,
  };
}

export function saveDraft(storage: DraftStorage, scope: string, draft: Draft): boolean {
  try {
    if (draft.boxes.length === 0) {
      storage.removeItem(storageKey(scope));
      return true;
    }
    if (draft.boxes.length > DRAFT_MAX_BOXES) return false;
    const text = JSON.stringify(draft);
    if (text.length > DRAFT_MAX_CHARS) return false;
    storage.setItem(storageKey(scope), text);
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(storage: DraftStorage, scope: string, sourceKey: string, pageCount: number): Draft | null {
  try {
    const text = storage.getItem(storageKey(scope));
    if (!text || text.length > DRAFT_MAX_CHARS) return null;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const draft = parsed as Record<string, unknown>;
    if (draft.version !== DRAFT_VERSION || draft.sourceKey !== sourceKey || draft.pageCount !== pageCount) return null;
    if (!Array.isArray(draft.boxes) || draft.boxes.length > DRAFT_MAX_BOXES) return null;
    const boxes = draft.boxes.map((entry) => sanitizeBox(entry, pageCount)).filter((entry): entry is SplitBox => entry !== null);
    const rotations: Record<number, Rotation> = {};
    const rawRotations = draft.rotations as Record<string, unknown> | undefined;
    if (rawRotations && typeof rawRotations === "object") {
      for (const [key, value] of Object.entries(rawRotations)) {
        const page = Number(key);
        if (Number.isInteger(page) && page >= 0 && page < pageCount && (value === 90 || value === 180 || value === 270)) rotations[page] = value;
      }
    }
    return { version: DRAFT_VERSION, sourceKey, savedAt: isNumber(draft.savedAt) ? draft.savedAt : 0, pageCount, boxes, rotations };
  } catch {
    return null;
  }
}

export function clearDraft(storage: DraftStorage, scope: string): void {
  try {
    storage.removeItem(storageKey(scope));
  } catch {
    return;
  }
}

export function peekDraft(storage: DraftStorage, scope: string): { sourceKey: string; pending: number } | null {
  try {
    const text = storage.getItem(storageKey(scope));
    if (!text) return null;
    const parsed = JSON.parse(text) as { version?: number; sourceKey?: string; boxes?: { transferred?: boolean }[] };
    if (parsed.version !== DRAFT_VERSION || typeof parsed.sourceKey !== "string" || !Array.isArray(parsed.boxes)) return null;
    return { sourceKey: parsed.sourceKey, pending: parsed.boxes.filter((box) => !box.transferred).length };
  } catch {
    return null;
  }
}
