import { addDaysToDateOnly, isDateOnly } from "@lgs/api";
import type { TopicPlanLesson } from "@lgs/api/queries";

export const PLAN_WINDOW_DAYS = 7;
export const PLAN_MAX_FUTURE_DAYS = 30;

export function parseWeekStart(value: string | null, today: string): string {
  if (!value || !isDateOnly(value)) return today;
  if (value < today) return today;
  const limit = addDaysToDateOnly(today, PLAN_MAX_FUTURE_DAYS);
  return value > limit ? limit : value;
}

export function weekRange(start: string): { from: string; to: string } {
  return { from: start, to: addDaysToDateOnly(start, PLAN_WINDOW_DAYS - 1) };
}

export function previousWeekStart(start: string, today: string): string | null {
  if (start <= today) return null;
  const previous = addDaysToDateOnly(start, -PLAN_WINDOW_DAYS);
  return previous < today ? today : previous;
}

export function nextWeekStart(start: string, today: string): string | null {
  const next = addDaysToDateOnly(start, PLAN_WINDOW_DAYS);
  return next > addDaysToDateOnly(today, PLAN_MAX_FUTURE_DAYS) ? null : next;
}

export function weekdayLabel(date: string): string {
  if (!isDateOnly(date)) return "";
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function shortDateLabel(date: string): string {
  if (!isDateOnly(date)) return "";
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export type PlanCellState = "planned" | "missing" | "locked" | "none" | "open";

export function planCellState(lesson: TopicPlanLesson): PlanCellState {
  if (lesson.topic) return lesson.canEdit ? "planned" : "locked";
  if (lesson.canEdit) return "missing";
  return lesson.targetCount > 0 ? "locked" : "none";
}

export function highlightsMissing(lesson: TopicPlanLesson, date: string, tomorrow: string): boolean {
  return date === tomorrow && lesson.topic === null && lesson.targetCount > 0 && lesson.canEdit;
}

export function parseTargetCount(value: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (!/^[0-9]{1,3}$/.test(trimmed)) return { ok: false, message: "Hedef soru sayısı sayı olmalı." };
  return { ok: true, value: Number(trimmed) };
}
