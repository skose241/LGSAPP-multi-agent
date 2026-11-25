import { overlapRatio } from "./geometry";
import { newBoxId, type SplitBox } from "./model";
import type { PageDetection } from "./text-detect";

export const OVERLAP_SKIP = 0.5;

export interface SuggestionResult {
  boxes: SplitBox[];
  added: number;
  skipped: number;
}

export function applyDetections(existing: readonly SplitBox[], detections: readonly PageDetection[]): SuggestionResult {
  const pages = new Set(detections.map((detection) => detection.page));
  const kept = existing.filter((box) => !(box.suggested && pages.has(box.page)));
  const added: SplitBox[] = [];
  let skipped = 0;
  for (const detection of detections) {
    const blockers = kept.filter((box) => box.page === detection.page && !box.suggested);
    for (const found of detection.boxes) {
      if (blockers.some((box) => overlapRatio(box.rect, found.rect) >= OVERLAP_SKIP)) {
        skipped += 1;
        continue;
      }
      added.push({ id: newBoxId(), page: detection.page, rect: found.rect, option: undefined, transferred: false, source: "text", suggested: true, detectedNumber: found.number, ...(detection.section !== undefined ? { section: detection.section } : {}) });
    }
  }
  return { boxes: [...kept, ...added], added: added.length, skipped };
}

export function firstDetectedNumber(boxes: readonly SplitBox[]): number | null {
  const numbers = boxes.filter((box) => box.suggested && box.detectedNumber !== undefined).map((box) => box.detectedNumber as number);
  return numbers.length > 0 ? Math.min(...numbers) : null;
}
