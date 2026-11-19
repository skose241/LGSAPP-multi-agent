export interface ParsedProblem {
  message: string;
  fieldErrors: Record<string, string[]>;
  formError: string | null;
  retryAfter: number | null;
  extensions?: Record<string, unknown>;
}

interface ProblemLike {
  title?: unknown;
  detail?: unknown;
  errors?: unknown;
}

const STANDARD_KEYS = new Set(["type", "title", "status", "detail", "instance", "errors", "traceId"]);

const DEFAULT_MESSAGE = "Beklenmeyen bir hata oluştu.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function normalizeFieldKey(key: string): string {
  return key.trim().toLowerCase();
}

export function parseRetryAfter(
  value: string | number | null | undefined,
  now: Date = new Date(),
): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.ceil(value) : null;
  }
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  const seconds = Math.ceil((date - now.getTime()) / 1000);
  return seconds > 0 ? seconds : 0;
}

export function parseProblem(
  body: unknown,
  retryAfterHeader?: string | number | null,
): ParsedProblem {
  const problem: ProblemLike = isRecord(body) ? body : {};
  const fieldErrors: Record<string, string[]> = {};
  let formError: string | null = null;

  if (isRecord(problem.errors)) {
    for (const [rawKey, rawValue] of Object.entries(problem.errors)) {
      const messages = (Array.isArray(rawValue) ? rawValue : [rawValue]).filter(
        (item): item is string => typeof item === "string" && item !== "",
      );
      if (messages.length === 0) continue;
      if (rawKey === "") {
        formError = formError ? `${formError} ${messages.join(" ")}` : messages.join(" ");
        continue;
      }
      const key = normalizeFieldKey(rawKey);
      fieldErrors[key] = [...(fieldErrors[key] ?? []), ...messages];
    }
  }

  const extensions: Record<string, unknown> = {};
  if (isRecord(body)) {
    for (const [key, value] of Object.entries(body)) {
      if (!STANDARD_KEYS.has(key)) extensions[key] = value;
    }
  }

  const message = asText(problem.detail) ?? asText(problem.title) ?? DEFAULT_MESSAGE;

  return {
    message,
    fieldErrors,
    formError,
    retryAfter: parseRetryAfter(retryAfterHeader),
    extensions,
  };
}

export function fieldError(parsed: ParsedProblem, field: string): string | undefined {
  return parsed.fieldErrors[normalizeFieldKey(field)]?.[0];
}

export function problemRunId(problem: ParsedProblem): number | null {
  const value = problem.extensions?.runId;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
