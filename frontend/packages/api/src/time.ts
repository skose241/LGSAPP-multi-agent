export const TIME_ZONE = "Europe/Istanbul";
const LOCALE = "tr-TR";

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function isValid(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

export function formatDateTime(value: string | Date): string {
  const date = toDate(value);
  if (!isValid(date)) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatDateTimeShort(value: string | Date): string {
  const date = toDate(value);
  if (!isValid(date)) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatTime(value: string | Date): string {
  const date = toDate(value);
  if (!isValid(date)) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnly(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

function splitDateOnly(value: string): [number, number, number] {
  return value.split("-").map(Number) as [number, number, number];
}

export function formatDateOnly(value: string): string {
  if (!isDateOnly(value)) return "";
  const [y, m, d] = splitDateOnly(value);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function todayInIstanbul(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function hourInIstanbul(now: Date = new Date()): number {
  const value = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number(value);
}

export function addDaysToDateOnly(value: string, days: number): string {
  if (!isDateOnly(value)) return "";
  const [y, m, d] = splitDateOnly(value);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function compareDateOnly(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  const date = new Date(expiresAt);
  return !isValid(date) || date.getTime() <= now.getTime();
}

export function formatRelativeTime(value: string | Date, now: Date = new Date()): string {
  const date = toDate(value);
  if (!isValid(date)) return "";
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "az önce";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dakika önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks} hafta önce`;
  return formatDateTimeShort(date);
}
