import { normalizeFieldKey, type ParsedProblem } from "@lgs/api";
import type { GenerationSchedule, ScheduleItem } from "@lgs/api/queries";

export const MAX_QUESTIONS_PER_CELL = 20;

export const SCHEDULE_DAYS: { day: number; name: string }[] = [
  { day: 1, name: "Pazartesi" },
  { day: 2, name: "Salı" },
  { day: 3, name: "Çarşamba" },
  { day: 4, name: "Perşembe" },
  { day: 5, name: "Cuma" },
  { day: 6, name: "Cumartesi" },
  { day: 7, name: "Pazar" },
];

export const CELL_RANGE_MESSAGE = `0 ile ${MAX_QUESTIONS_PER_CELL} arasında bir tam sayı girin.`;

export function cellKey(day: number, lessonId: number): string {
  return `${day}-${lessonId}`;
}

export function baselineValues(schedule: GenerationSchedule): Record<string, string> {
  const values: Record<string, string> = {};
  for (const item of schedule.items) values[cellKey(item.isoDayOfWeek, item.lessonId)] = String(item.questionCount);
  return values;
}

export function validateCell(raw: string): string | undefined {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return CELL_RANGE_MESSAGE;
  if (Number(text) > MAX_QUESTIONS_PER_CELL) return CELL_RANGE_MESSAGE;
  return undefined;
}

export function cellNumber(raw: string | undefined): number {
  const text = (raw ?? "").trim();
  return /^\d+$/.test(text) ? Number(text) : 0;
}

export function currentValue(schedule: GenerationSchedule, edited: Record<string, string>, day: number, lessonId: number): string {
  const key = cellKey(day, lessonId);
  return edited[key] ?? baselineValues(schedule)[key] ?? "0";
}

export function changedKeys(schedule: GenerationSchedule, edited: Record<string, string>): string[] {
  const base = baselineValues(schedule);
  return Object.keys(edited).filter((key) => edited[key]!.trim() !== (base[key] ?? "0"));
}

export function isDirty(schedule: GenerationSchedule, edited: Record<string, string>): boolean {
  return changedKeys(schedule, edited).length > 0;
}

export function validateAll(schedule: GenerationSchedule, edited: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const lesson of schedule.lessons) {
    for (const { day } of SCHEDULE_DAYS) {
      const problem = validateCell(currentValue(schedule, edited, day, lesson.id));
      if (problem) errors[cellKey(day, lesson.id)] = problem;
    }
  }
  return errors;
}

export interface BuiltSchedule {
  items: ScheduleItem[];
  keys: string[];
}

export function buildItems(schedule: GenerationSchedule, edited: Record<string, string>): BuiltSchedule {
  const base = baselineValues(schedule);
  const items: ScheduleItem[] = [];
  const keys: string[] = [];
  for (const { day } of SCHEDULE_DAYS) {
    for (const lesson of schedule.lessons) {
      const key = cellKey(day, lesson.id);
      const count = cellNumber(currentValue(schedule, edited, day, lesson.id));
      if (count === 0 && !(key in base)) continue;
      items.push({ isoDayOfWeek: day, lessonId: lesson.id, questionCount: count });
      keys.push(key);
    }
  }
  return { items, keys };
}

export function mapServerErrors(problem: ParsedProblem | null, keys: string[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!problem) return errors;
  keys.forEach((key, index) => {
    const message = problem.fieldErrors[normalizeFieldKey(`items[${index}]`)]?.[0];
    if (message) errors[key] = message;
  });
  return errors;
}

export function dayTotal(schedule: GenerationSchedule, edited: Record<string, string>, day: number): number {
  return schedule.lessons.reduce((sum, lesson) => sum + cellNumber(currentValue(schedule, edited, day, lesson.id)), 0);
}
