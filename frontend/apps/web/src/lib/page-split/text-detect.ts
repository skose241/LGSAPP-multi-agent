import type { TextFragment } from "@/lib/pdf/text-content";
import { MIN_SIDE, clampRect, type Rect } from "./geometry";
import { sectionLabelOf } from "./sections";
import { foldText, toLines, type TextRow } from "./text-lines";

export type DetectConfidence = "high" | "low" | "none";
export type DetectIssueCode = "noText" | "noNumbers" | "gap" | "repeat" | "backward" | "continuity" | "overflow" | "answerKeyDoubt" | "noQuestions";

export interface DetectIssue {
  code: DetectIssueCode;
  message: string;
}

export interface DetectedBox {
  rect: Rect;
  number: number;
  sharedStem: boolean;
}

export interface PageDetection {
  page: number;
  boxes: DetectedBox[];
  confidence: DetectConfidence;
  issues: DetectIssue[];
  skipped?: "answerKey";
  section?: string;
}

export interface PageContext {
  margins?: readonly number[];
  expected?: number | null;
  strict?: boolean;
  questionLike?: boolean;
}

export interface DetectOptions {
  answerKeyFrom?: readonly (number | null)[];
}

interface Candidate {
  line: TextRow;
  number: number;
}

interface LineKind {
  number: number | null;
  rangeStart: number | null;
}

const NUMBER_PATTERN = /^(\d{1,3})\s*([.)\-–])(?!\d)\s*(.*)$/u;
const WORD_PATTERN = /^soru\s*(\d{1,3})(?!\d)/u;
const RANGE_START = /^\d{1,3}\s*[-–]\s*\d/u;
const RANGE_ANY = /(\d{1,3})(?:\s*,\s*\d{1,3})*\s*(?:[-–]|\bve\b|,)\s*(\d{1,3})\s*\.?\s*soru/u;
const STATIC_MARGIN = /^(diğer sayfaya geçiniz\.?|sayfa \d+( ?\/ ?\d+)?|\d+ ?\/ ?\d+|-\s*\d+\s*-)$/u;

const EDGE = 0.004;
const SIDE_PAD = 0.015;
const GUTTER_PAD = 0.025;
const NEIGHBOR_PAD = 0.003;
const CONTINUATION_GAP = 0.012;
const COLUMN_DISTANCE = 0.25;
const CLUSTER_TOLERANCE = 0.03;
const STEM_REACH = 0.45;
const MARGIN_TOP = 0.1;
const MARGIN_BOTTOM = 0.9;
const PAGE_BOTTOM = 0.985;

export function parseLine(text: string): LineKind {
  const folded = foldText(text);
  const range = RANGE_ANY.exec(folded);
  const rangeStart = range ? Number(range[1]) : null;
  if (RANGE_START.test(folded)) return { number: null, rangeStart: rangeStart ?? Number(/^\d+/u.exec(folded)?.[0]) };
  const direct = NUMBER_PATTERN.exec(text.trim());
  if (direct) {
    const value = Number(direct[1]);
    const dash = direct[2] === "-" || direct[2] === "–";
    const rest = direct[3] ?? "";
    if (dash && rest !== "" && !/^\p{Lu}/u.test(rest)) return { number: null, rangeStart };
    return { number: value >= 1 ? value : null, rangeStart };
  }
  const word = WORD_PATTERN.exec(folded);
  if (word) {
    const value = Number(word[1]);
    return { number: value >= 1 ? value : null, rangeStart };
  }
  return { number: null, rangeStart };
}

const WEAK_LABEL = /^\d{1,3}\s*[.)]\s*(satır|etkinlik|uygulama|konum|aşama|çaprazlama|adım|deney)(?![\p{L}])/u;
const WEAK_INSTRUCTION = /^\d{1,3}\s*[.)]\s*(bu testte|cevaplarınızı|bu kitapçıkta)/u;
const OPTION_LINE = /^[A-D]\)/u;
const MARGIN_NEAR = 0.01;
const MARGIN_MIN_COUNT = 3;
const MARGIN_MIN_SAMPLES = 12;
const MARGIN_SHARE = 0.2;
const STRICT_PAGES = 3;
const OPTION_LINES_NEEDED = 2;
const HEADING_ZONE = 0.2;

export function isWeakLine(text: string): boolean {
  const folded = foldText(text);
  return WEAK_LABEL.test(folded) || WEAK_INSTRUCTION.test(folded);
}

export function isQuestionLike(lines: readonly TextRow[]): boolean {
  return lines.filter((line) => OPTION_LINE.test(line.text.trim())).length >= OPTION_LINES_NEEDED;
}

export function learnMargins(pageLines: readonly (readonly TextRow[])[]): number[] {
  const like = pageLines.map(isQuestionLike);
  const restrict = like.some(Boolean);
  const xs: number[] = [];
  pageLines.forEach((lines, index) => {
    if (restrict && !like[index]) return;
    for (const line of lines) {
      if (line.x < 0.85 && parseLine(line.text).number !== null && !isWeakLine(line.text)) xs.push(line.x);
    }
  });
  if (xs.length < MARGIN_MIN_SAMPLES) return [];
  xs.sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (last && x - (last[0] ?? 0) <= MARGIN_NEAR) last.push(x);
    else clusters.push([x]);
  }
  const largest = Math.max(0, ...clusters.map((cluster) => cluster.length));
  return clusters
    .filter((cluster) => cluster.length >= MARGIN_MIN_COUNT && cluster.length >= largest * MARGIN_SHARE)
    .map((cluster) => cluster[Math.floor(cluster.length / 2)] ?? 0);
}

export function pageHeading(lines: readonly TextRow[]): string | null {
  for (const line of lines) {
    if (centerOf(line) > HEADING_ZONE) break;
    const label = sectionLabelOf(line.text);
    if (label) return label;
  }
  return null;
}

function centerOf(line: TextRow): number {
  return (line.y + line.bottom) / 2;
}

function marginSignature(line: TextRow, isCandidate: boolean): string | null {
  const center = centerOf(line);
  const zone = center < MARGIN_TOP ? "t" : center > MARGIN_BOTTOM ? "b" : null;
  if (!zone) return null;
  const text = foldText(line.text);
  return `${zone}|${Math.round(center * 25)}|${isCandidate ? text : text.replace(/\d+/gu, "#")}`;
}

export function findMarginLines(pageLines: readonly (readonly TextRow[])[]): Set<TextRow>[] {
  const counts = new Map<string, number>();
  const signatures = pageLines.map((lines) => {
    const map = new Map<TextRow, string>();
    for (const line of lines) {
      const signature = marginSignature(line, parseLine(line.text).number !== null);
      if (signature) map.set(line, signature);
    }
    return map;
  });
  for (const map of signatures) {
    for (const signature of new Set(map.values())) counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  const needed = Math.max(2, Math.ceil(pageLines.length * 0.25));
  return signatures.map((map) => {
    const removed = new Set<TextRow>();
    for (const [line, signature] of map) {
      if ((counts.get(signature) ?? 0) >= needed || STATIC_MARGIN.test(foldText(line.text))) removed.add(line);
    }
    return removed;
  });
}

function chainLength(items: readonly Candidate[]): number {
  const best: number[] = [];
  let top = 0;
  items.forEach((item, index) => {
    let length = 1;
    for (let previous = 0; previous < index; previous += 1) {
      if ((items[previous]?.number ?? 0) < item.number) length = Math.max(length, (best[previous] ?? 0) + 1);
    }
    best[index] = length;
    top = Math.max(top, length);
  });
  return top;
}

function clusterByX(candidates: readonly Candidate[]): Candidate[][] {
  const sorted = [...candidates].sort((a, b) => a.line.x - b.line.x);
  const clusters: Candidate[][] = [];
  for (const candidate of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && candidate.line.x - (last[0]?.line.x ?? 0) <= CLUSTER_TOLERANCE) last.push(candidate);
    else clusters.push([candidate]);
  }
  return clusters.map((cluster) => cluster.sort((a, b) => a.line.y - b.line.y));
}

function pickColumns(clusters: readonly Candidate[][]): Candidate[][] {
  const groups: Candidate[][][] = [];
  for (const cluster of clusters) {
    const last = groups[groups.length - 1];
    if (last && (cluster[0]?.line.x ?? 0) - (last[0]?.[0]?.line.x ?? 0) < COLUMN_DISTANCE) last.push(cluster);
    else groups.push([cluster]);
  }
  const best = groups.map((group) => {
    let winner = group[0] ?? [];
    for (const cluster of group) {
      if (chainLength(cluster) > chainLength(winner)) winner = cluster;
    }
    return winner;
  });
  const largest = Math.max(0, ...best.map((cluster) => cluster.length));
  const result: Candidate[][] = [];
  let lastNumber = 0;
  for (const cluster of best) {
    const first = cluster[0]?.number ?? 0;
    const lone = cluster.length === 1 && largest >= 5;
    if (lone && first !== lastNumber + 1) continue;
    result.push(cluster);
    lastNumber = Math.max(lastNumber, ...cluster.map((entry) => entry.number));
  }
  return result;
}

const MARGIN_TOLERANCE = 0.012;
const STEM_MIN_CHARS = 14;
const STRONG_CHAIN = 3;
const JUMP_WEIGHT = 0.3;
const OFFSET_WEIGHT = 2;

const EXPECTED_BONUS = 1.5;

export function bestChain(items: readonly { number: number; offset: number }[], expected: number | null = null): Set<number> {
  const score: number[] = [];
  const previous: number[] = [];
  let bestIndex = -1;
  items.forEach((item, index) => {
    const unit = Math.max(0.1, 1 - Math.max(0, item.offset) * OFFSET_WEIGHT);
    let top = item.number === expected ? unit * EXPECTED_BONUS : unit;
    let from = -1;
    for (let before = 0; before < index; before += 1) {
      const other = items[before];
      if (!other || other.number >= item.number) continue;
      const candidate = (score[before] ?? 0) + (item.number === other.number + 1 ? unit : unit * JUMP_WEIGHT);
      if (candidate > top + 1e-9) {
        top = candidate;
        from = before;
      }
    }
    score[index] = top;
    previous[index] = from;
    if (bestIndex < 0 || top > (score[bestIndex] ?? 0) + 1e-9) bestIndex = index;
  });
  const chosen = new Set<number>();
  for (let index = bestIndex; index >= 0; index = previous[index] ?? -1) chosen.add(index);
  return chosen;
}

function describeMissing(from: number, to: number): string {
  return to - from === 1 ? `${from}` : `${from}–${to - 1}`;
}

type PageResult = { detection: PageDetection; overflow: boolean };

export function detectPageLines(page: number, lines: readonly TextRow[], footerTop: number | null, context: PageContext = {}): PageResult {
  const none = (code: DetectIssueCode, message: string): PageResult => ({
    detection: { page, boxes: [], confidence: "none", issues: [{ code, message }] },
    overflow: false,
  });
  if (lines.length === 0) return none("noText", "Bu sayfada metin bulunamadı.");

  const kinds = lines.map((line) => ({ line, kind: parseLine(line.text) }));
  let candidates: Candidate[] = kinds.flatMap(({ line, kind }) => (kind.number !== null && line.x < 0.85 && !isWeakLine(line.text) ? [{ line, number: kind.number }] : []));
  const margins = context.margins ?? [];
  if (margins.length > 0) {
    const onMargin = candidates.filter((candidate) => margins.some((margin) => Math.abs(candidate.line.x - margin) <= MARGIN_NEAR));
    if (onMargin.length > 0) candidates = onMargin;
    else if (context.strict && !context.questionLike) candidates = [];
  }
  if (candidates.length === 0) return none(context.strict && !context.questionLike ? "noQuestions" : "noNumbers", context.strict && !context.questionLike ? "Bu sayfada soru bulunamadı." : "Soru numarası bulunamadı.");

  const columns = pickColumns(clusterByX(candidates));
  if (columns.length === 0) return none("noNumbers", "Soru numarası bulunamadı.");
  const ordered = [...columns].sort((a, b) => (a[0]?.line.x ?? 0) - (b[0]?.line.x ?? 0));
  const anchors = ordered.map((column) => Math.min(...column.map((entry) => entry.line.x)));

  const issues: DetectIssue[] = [];
  const kept: Candidate[][] = ordered.map(() => []);
  const flat = ordered.flatMap((column, index) => column.map((candidate) => ({ candidate, column: index })));
  const chosen = bestChain(flat.map((entry) => ({ number: entry.candidate.number, offset: entry.candidate.line.x - (anchors[entry.column] ?? 0) })), context.expected ?? null);
  let previous = 0;
  let highest = 0;
  const seen = new Set<number>();
  flat.forEach((entry, position) => {
    if (!chosen.has(position)) return;
    kept[entry.column]?.push(entry.candidate);
    if (previous > 0 && entry.candidate.number > previous + 1) {
      issues.push({ code: "gap", message: `Numara sırasında eksik var: ${describeMissing(previous + 1, entry.candidate.number)}.` });
    }
    previous = entry.candidate.number;
    highest = Math.max(highest, previous);
    seen.add(previous);
  });
  flat.forEach((entry, position) => {
    if (chosen.has(position) || entry.candidate.line.x - (anchors[entry.column] ?? 0) > MARGIN_TOLERANCE) return;
    if (seen.has(entry.candidate.number)) issues.push({ code: "repeat", message: `Aynı numara tekrar bulundu: ${entry.candidate.number}.` });
    else if (entry.candidate.number < highest) issues.push({ code: "backward", message: `Numara geri gidiyor: ${entry.candidate.number}.` });
  });
  if (kept.every((column) => column.length === 0)) return none("noNumbers", "Soru numarası bulunamadı.");

  const columnOf = (line: { x: number }): number => {
    let found = -1;
    anchors.forEach((anchor, index) => {
      if (anchor <= line.x + 0.04) found = index;
    });
    return found;
  };

  const placed: { fragment: TextFragment; column: number }[] = [];
  for (const { line } of kinds) {
    let current = -1;
    let previousEnd = Number.NEGATIVE_INFINITY;
    for (const fragment of line.fragments) {
      if (current < 0 || fragment.x - previousEnd >= CONTINUATION_GAP) current = columnOf(fragment);
      placed.push({ fragment, column: current });
      previousEnd = Math.max(previousEnd, fragment.x + fragment.w);
    }
  }

  const leftMargin = Math.max(0.01, (anchors[0] ?? 0) - SIDE_PAD);
  const bottomLimit = Math.min(PAGE_BOTTOM, footerTop === null ? PAGE_BOTTOM : footerTop - 0.006);
  const boxes: DetectedBox[] = [];
  let overflow = false;

  kept.forEach((column, index) => {
    if (column.length === 0) return;
    const colLines = kinds.filter(({ line }) => columnOf(line) === index);
    const markers = colLines.flatMap(({ line, kind }) => (kind.rangeStart !== null && kind.number === null ? [{ line, start: kind.rangeStart }] : []));
    const anchor = anchors[index] ?? 0;
    const textLeft = Math.min(anchor, ...colLines.filter(({ line }) => line.x >= anchor - 0.1).map(({ line }) => line.x));
    const left = Math.max(0.01, textLeft - SIDE_PAD);
    const isLast = index === anchors.length - 1;
    const maxRight = Math.max(anchor, ...colLines.map(({ line }) => line.right));
    const right = isLast ? Math.min(0.99, Math.max(1 - leftMargin, maxRight + 0.01)) : Math.max(left + MIN_SIDE, (anchors[index + 1] ?? 1) - GUTTER_PAD);

    const tops: { top: number; stem: boolean; candidate: Candidate }[] = [];
    let previousY = -1;
    for (const candidate of column) {
      const marker = markers.find((entry) => entry.start === candidate.number && entry.line.y > previousY && entry.line.y < candidate.line.y && candidate.line.y - entry.line.bottom < STEM_REACH);
      tops.push({ top: marker ? marker.line.y : candidate.line.y, stem: marker !== undefined, candidate });
      previousY = candidate.line.y;
    }
    const firstTop = tops[0]?.top ?? 0;
    if (colLines.some(({ line, kind }) => line.bottom <= firstTop + 0.002 && centerOf(line) > MARGIN_TOP && kind.rangeStart === null)) overflow = true;

    tops.forEach((entry, position) => {
      const next = tops[position + 1];
      const top = Math.max(0, entry.top - EDGE);
      const bottom = next ? Math.max(top, next.top - EDGE - 0.002) : Math.max(top, bottomLimit);
      let floorLeft = 0;
      let ceilRight = 1;
      let ownLeft = left;
      let ownRight = right;
      for (const { fragment, column: other } of placed) {
        if (fragment.y + fragment.h <= top || fragment.y >= bottom) continue;
        if (other === index) {
          ownLeft = Math.min(ownLeft, fragment.x - NEIGHBOR_PAD);
          if (!isLast) ownRight = Math.max(ownRight, fragment.x + fragment.w + NEIGHBOR_PAD);
        } else if (other < index && fragment.x < anchor) {
          floorLeft = Math.max(floorLeft, Math.min(fragment.x + fragment.w + NEIGHBOR_PAD, anchor - NEIGHBOR_PAD));
        } else if (other > index && fragment.x > anchor) {
          ceilRight = Math.min(ceilRight, Math.max(fragment.x - NEIGHBOR_PAD, anchor + MIN_SIDE));
        }
      }
      const boxLeft = Math.max(floorLeft, Math.min(left, ownLeft));
      const boxRight = Math.min(ceilRight, isLast ? right : Math.max(right, Math.min(ownRight, (anchors[index + 1] ?? 1) - NEIGHBOR_PAD)));
      const rect = { x: boxLeft, y: top, width: boxRight - boxLeft, height: bottom - top };
      if (rect.width < MIN_SIDE || rect.height < MIN_SIDE) return;
      boxes.push({ rect: clampRect(rect), number: entry.candidate.number, sharedStem: entry.stem });
    });
  });

  if (boxes.length === 0) return none("noNumbers", "Soru numarası bulunamadı.");
  boxes.sort((a, b) => a.number - b.number);
  return { detection: { page, boxes, confidence: issues.length > 0 ? "low" : "high", issues }, overflow };
}

export function detectDocument(pages: readonly (readonly TextFragment[])[], options: DetectOptions = {}): PageDetection[] {
  const keyFrom = options.answerKeyFrom ?? [];
  const rawLines = pages.map((fragments) => toLines(fragments));
  const learned = learnMargins(rawLines);
  const allLines = learned.length > 0 ? pages.map((fragments) => toLines(fragments, { splitAt: learned })) : rawLines;
  const margins = findMarginLines(allLines);
  const likeFlags = allLines.map(isQuestionLike);
  const strict = likeFlags.filter(Boolean).length >= STRICT_PAGES;
  const results: PageDetection[] = [];
  const names: (string | null)[] = [];
  const sectionOf: number[] = [];
  let sectionIndex = -1;
  let currentLabel: string | null = null;
  let lastNumber: number | null = null;
  let seenBoxes = false;

  allLines.forEach((lines, page) => {
    let cut = keyFrom[page] ?? null;
    const removed = margins[page] ?? new Set<TextRow>();
    let doubt = false;
    if (cut !== null && cut <= 0.12) {
      const stems = lines.filter((line) => !removed.has(line) && line.text.length >= STEM_MIN_CHARS);
      if (detectPageLines(page, stems, null).detection.boxes.length >= STRONG_CHAIN) {
        doubt = true;
        cut = null;
      } else {
        results.push({ page, boxes: [], confidence: "none", issues: [], skipped: "answerKey" });
        return;
      }
    }
    const footers = lines.filter((line) => removed.has(line) && centerOf(line) > 0.5).map((line) => line.y);
    const body = lines.filter((line) => !removed.has(line) && (cut === null || line.bottom <= cut));
    const limits = [...footers, ...(cut === null ? [] : [cut])];
    const footerTop = limits.length > 0 ? Math.min(...limits) : null;
    const heading = pageHeading(lines);
    let sectionStart = false;
    if (heading !== null && heading !== currentLabel) {
      currentLabel = heading;
      sectionIndex += 1;
      names.push(heading);
      lastNumber = null;
      sectionStart = true;
    }
    const expected = lastNumber === null ? 1 : lastNumber + 1;
    let { detection, overflow } = detectPageLines(page, body, footerTop, { margins: learned, expected, strict, questionLike: likeFlags[page] ?? false });
    if (strict && !likeFlags[page] && detection.boxes.length > 0) {
      const first = detection.boxes[0]?.number ?? 0;
      if (!((lastNumber !== null && first === lastNumber + 1) || (sectionStart && first === 1))) {
        detection = { page, boxes: [], confidence: "none", issues: [{ code: "noQuestions", message: "Bu sayfada soru bulunamadı." }] };
        overflow = false;
      }
    }
    if (doubt && detection.boxes.length > 0) detection.issues.push({ code: "answerKeyDoubt", message: "Sayfa cevap anahtarına benziyor ama soru numaraları da var." });
    if (detection.boxes.length > 0) {
      const first = detection.boxes[0]?.number ?? 0;
      if (sectionIndex < 0) {
        sectionIndex = 0;
        names.push(null);
        sectionStart = true;
      } else if (!sectionStart && first === 1 && lastNumber !== null && lastNumber >= 2) {
        sectionIndex += 1;
        names.push(null);
        lastNumber = null;
        sectionStart = true;
      }
      if (lastNumber !== null && first !== lastNumber + 1) {
        detection.issues.push({ code: "continuity", message: `Numara önceki sayfadan devam etmiyor: beklenen ${lastNumber + 1}, bulunan ${first}.` });
      }
      if (overflow && seenBoxes && !sectionStart) detection.issues.push({ code: "overflow", message: "Sayfa başında önceki sayfadan taşan bir soru olabilir." });
      if (detection.issues.length > 0) detection.confidence = "low";
      lastNumber = detection.boxes[detection.boxes.length - 1]?.number ?? lastNumber;
      seenBoxes = true;
      sectionOf[page] = sectionIndex;
    }
    results.push(detection);
  });
  results.forEach((detection) => {
    const index = sectionOf[detection.page];
    if (index === undefined || detection.boxes.length === 0) return;
    const label = names[index] ?? (names.length > 1 ? `Bölüm ${index + 1}` : undefined);
    if (label !== undefined) detection.section = label;
  });
  return results;
}

export const ISSUE_BADGES: Record<DetectIssueCode, string> = {
  noText: "Metin Yok",
  noNumbers: "Numara Bulunamadı",
  gap: "Numara Sırası Eksik",
  repeat: "Numara Tekrarı",
  backward: "Numara Geri Gidiyor",
  continuity: "Sayfa Sırası Uyumsuz",
  overflow: "Sayfaya Taşan Soru",
  answerKeyDoubt: "Cevap Anahtarı Şüpheli",
  noQuestions: "Soru Bulunamadı",
};

export function badgeFor(detection: PageDetection): string | null {
  if (detection.skipped) return null;
  const first = detection.issues[0];
  if (!first) return null;
  return ISSUE_BADGES[first.code];
}
