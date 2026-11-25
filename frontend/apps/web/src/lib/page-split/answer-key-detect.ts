import type { TextFragment } from "@/lib/pdf/text-content";
import { sectionLabelOf } from "./sections";
import { groupRows, splitRow, type TextRow } from "./text-lines";

export interface KeySection {
  name: string | null;
  answers: Map<number, string>;
}

export interface PageAnswerKey {
  page: number;
  isKey: boolean;
  fromY: number | null;
  answers: Map<number, string>;
  sections: KeySection[];
}

export interface DocumentAnswerKey {
  pages: PageAnswerKey[];
  keyPages: number[];
  answers: Map<number, string>;
  conflicts: number[];
  sections: KeySection[];
}

const HEADING = /cevap\s+anahtar[ıi]/u;
const HEADING_ONLY = /^(cevaplar|doğru cevaplar)\s*:?$/u;
const PAIR = /(?<![\d.,])(\d{1,3})\s*[.)\-–:=]?\s*([ABCD])(?![\p{L}\d)])/giu;
const HEADING_REST_MAX = 14;
const HEADING_END_REST_MAX = 2;
const HEADING_END_LEADING_MAX = 8;
const HEADING_UPPER_SHARE = 0.7;
const COLUMN_SLACK = 0.06;
const PAIR_COVERAGE = 0.6;
const NUMBER_ROW = /^\d{1,3}(\s+\d{1,3})+$/u;
const LETTER_ROW = /^[ABCD](\s+[ABCD])+$/iu;
const HEADERLESS_MIN = 8;
const HEADERLESS_SHARE = 0.6;

function lowerTr(text: string): string {
  return text.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
}

export function isKeyHeading(text: string): boolean {
  const folded = lowerTr(text);
  if (HEADING_ONLY.test(folded)) return true;
  const match = HEADING.exec(folded);
  if (!match) return false;
  const leading = folded.slice(0, match.index).trim().split(" ").filter(Boolean).length;
  const rest = folded.slice(match.index + match[0].length).trim();
  if (leading <= 2 && rest.length <= HEADING_REST_MAX && !/d[ıiuü]r\b/u.test(rest)) return true;
  const letters = [...text].filter((char) => /\p{L}/u.test(char));
  const upper = letters.filter((char) => char === char.toLocaleUpperCase("tr") && char !== char.toLocaleLowerCase("tr")).length;
  return rest.replace(/[^\p{L}\d]/gu, "").length <= HEADING_END_REST_MAX && leading <= HEADING_END_LEADING_MAX && letters.length > 0 && upper / letters.length >= HEADING_UPPER_SHARE;
}

function sectionsOf(rows: readonly TextRow[]): { sections: KeySection[]; pairRows: number } {
  const lines = rows.flatMap((row) => splitRow(row)).sort((a, b) => a.y - b.y || a.x - b.x);
  const headers = lines.flatMap((line) => {
    const label = sectionLabelOf(line.text);
    return label ? [{ label, x: line.x, line }] : [];
  });
  const distinct = [...new Set(headers.map((header) => header.label))];
  if (distinct.length < 2) {
    const parsed = parseRows(rows.filter((row) => sectionLabelOf(row.text) === null));
    return { sections: [{ name: distinct[0] ?? null, answers: parsed.answers }], pairRows: parsed.pairRows };
  }
  const columns = distinct.map((label) => ({ label, x: Math.min(...headers.filter((header) => header.label === label).map((header) => header.x)) })).sort((a, b) => a.x - b.x);
  const grouped = new Map<string, TextRow[]>(columns.map((column) => [column.label, []]));
  const headerLines = new Set(headers.map((header) => header.line));
  for (const line of lines) {
    if (headerLines.has(line)) continue;
    let target = columns[0];
    for (const column of columns) if (column.x <= line.x + COLUMN_SLACK) target = column;
    if (target) grouped.get(target.label)?.push(line);
  }
  let pairRows = 0;
  const sections = columns.map((column) => {
    const parsed = parseRows(grouped.get(column.label) ?? []);
    pairRows += parsed.pairRows;
    return { name: column.label, answers: parsed.answers };
  });
  return { sections, pairRows };
}

function flatten(sections: readonly KeySection[]): Map<number, string> {
  const answers = new Map<number, string>();
  for (const section of sections) for (const [number, letter] of section.answers) if (!answers.has(number)) answers.set(number, letter);
  return answers;
}

function pairsOf(text: string): { pairs: [number, string][]; covered: number } {
  const pairs: [number, string][] = [];
  let covered = 0;
  for (const match of text.matchAll(PAIR)) {
    const number = Number(match[1]);
    if (number >= 1) {
      pairs.push([number, (match[2] ?? "").toUpperCase()]);
      covered += match[0].length;
    }
  }
  return { pairs, covered };
}

function parseRows(rows: readonly TextRow[]): { answers: Map<number, string>; pairRows: number } {
  const answers = new Map<number, string>();
  let pairRows = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    const text = row.text;
    const next = rows[index + 1];
    if (NUMBER_ROW.test(text) && next && LETTER_ROW.test(next.text)) {
      const numbers = text.split(/\s+/u).map(Number);
      const letters = next.text.split(/\s+/u).map((letter) => letter.toUpperCase());
      if (numbers.length === letters.length) {
        numbers.forEach((number, position) => {
          if (number >= 1 && !answers.has(number)) answers.set(number, letters[position] ?? "");
        });
        pairRows += 1;
        index += 1;
        continue;
      }
    }
    const { pairs, covered } = pairsOf(text);
    if (pairs.length > 0) {
      if (covered >= text.length * PAIR_COVERAGE) pairRows += 1;
      for (const [number, letter] of pairs) if (!answers.has(number)) answers.set(number, letter);
    }
  }
  return { answers, pairRows };
}

export function detectAnswerKeyPage(page: number, fragments: readonly TextFragment[]): PageAnswerKey {
  const rows = groupRows(fragments);
  const heading = rows.find((row) => isKeyHeading(row.text));
  if (heading) {
    const { sections } = sectionsOf(rows.filter((row) => row !== heading && row.y > heading.y));
    return { page, isKey: true, fromY: Math.max(0, heading.y), answers: flatten(sections), sections };
  }
  const { sections, pairRows } = sectionsOf(rows);
  const answers = flatten(sections);
  const total = sections.reduce((sum, section) => sum + section.answers.size, 0);
  const content = rows.filter((row) => sectionLabelOf(row.text) === null).length;
  if (total >= HEADERLESS_MIN && content > 0 && pairRows / content >= HEADERLESS_SHARE) {
    return { page, isKey: true, fromY: 0, answers, sections };
  }
  return { page, isKey: false, fromY: null, answers: new Map(), sections: [] };
}

export function mergeKeyPages(results: readonly PageAnswerKey[], only?: readonly number[]): { answers: Map<number, string>; conflicts: number[]; pages: number[]; sections: KeySection[] } {
  const merged: KeySection[] = [];
  const conflicts = new Set<number>();
  for (const result of results) {
    if (!result.isKey || (only && !only.includes(result.page))) continue;
    for (const section of result.sections) {
      let target = merged.find((entry) => entry.name === section.name);
      if (!target) {
        target = { name: section.name, answers: new Map() };
        merged.push(target);
      }
      for (const [number, letter] of section.answers) {
        const existing = target.answers.get(number);
        if (existing === undefined) target.answers.set(number, letter);
        else if (existing !== letter) conflicts.add(number);
      }
    }
  }
  const pages = results.filter((result) => result.isKey && (!only || only.includes(result.page))).map((result) => result.page);
  return { pages, answers: flatten(merged), conflicts: [...conflicts].sort((a, b) => a - b), sections: merged };
}

export function detectAnswerKeys(pages: readonly (readonly TextFragment[])[]): DocumentAnswerKey {
  const results = pages.map((fragments, page) => detectAnswerKeyPage(page, fragments));
  const merged = mergeKeyPages(results);
  return { pages: results, keyPages: merged.pages, answers: merged.answers, conflicts: merged.conflicts, sections: merged.sections };
}
