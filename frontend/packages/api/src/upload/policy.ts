import { parseProblem, type ParsedProblem } from "../problem";

export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1000, 3000, 9000];
export const DEFAULT_MAX_RETRY_AFTER_MS = 120_000;
export const DEFAULT_CONCURRENCY = 3;
export const MIN_RETRY_AFTER_MS = 1000;

export type FailureKind =
  | "network"
  | "timeout"
  | "server"
  | "rateLimit"
  | "quota"
  | "validation"
  | "tooLarge"
  | "heic"
  | "auth"
  | "conflict"
  | "prepare"
  | "unknown";

export interface UploadFailure {
  kind: FailureKind;
  status: number;
  message: string;
  retryable: boolean;
  manualRetry: boolean;
  retryAfterSeconds: number | null;
}

export interface FailureInput {
  status: number;
  body: unknown;
  retryAfterHeader?: string | null;
  sessionRefreshed?: boolean;
  transport?: "network" | "timeout";
}

const NETWORK_MESSAGE = "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.";
const TIMEOUT_MESSAGE = "Yükleme çok uzun sürdü. Bağlantınızı kontrol edip tekrar deneyin.";
const SERVER_MESSAGE = "Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar deneyin.";

function firstFieldMessage(problem: ParsedProblem): string | null {
  for (const messages of Object.values(problem.fieldErrors)) {
    const first = messages[0];
    if (first) return first;
  }
  return null;
}

function detailMessage(problem: ParsedProblem): string {
  return firstFieldMessage(problem) ?? problem.formError ?? problem.message;
}

function failure(kind: FailureKind, status: number, message: string, retryable: boolean, manualRetry: boolean, retryAfterSeconds: number | null = null): UploadFailure {
  return { kind, status, message, retryable, manualRetry, retryAfterSeconds };
}

export function classifyFailure(input: FailureInput, maxRetryAfterMs: number = DEFAULT_MAX_RETRY_AFTER_MS): UploadFailure {
  if (input.transport === "network") return failure("network", 0, NETWORK_MESSAGE, true, true);
  if (input.transport === "timeout") return failure("timeout", 0, TIMEOUT_MESSAGE, true, true);

  const status = input.status;
  const problem = parseProblem(input.body, input.retryAfterHeader ?? null);
  const retryAfter = problem.retryAfter;

  if (status === 401) {
    if (input.sessionRefreshed) return failure("auth", status, "Oturum yenilendi, yükleme yeniden denenecek.", true, true);
    return failure("auth", status, "Oturumunuz sona erdi. Yeniden giriş yapmanız gerekiyor.", false, false);
  }

  if (status === 413) return failure("tooLarge", status, detailMessage(problem), false, false);

  if (status === 429) {
    if (retryAfter === null) return failure("quota", status, detailMessage(problem), false, false);
    if (retryAfter * 1000 > maxRetryAfterMs) {
      return failure("rateLimit", status, `Çok fazla istek gönderildi. ${retryAfter} saniye sonra tekrar deneyin.`, false, true, retryAfter);
    }
    return failure("rateLimit", status, "Çok fazla istek gönderildi. Biraz bekleyip tekrar deneyin.", true, true, retryAfter);
  }

  if (status === 408 || status >= 500) {
    return failure("server", status, SERVER_MESSAGE, true, true, retryAfter);
  }

  if (status === 409) {
    return failure("conflict", status, detailMessage(problem), true, true, retryAfter);
  }

  if (status === 400 || status === 415 || status === 422) {
    const message = detailMessage(problem);
    const heic = /heic|heif/i.test(message);
    return failure(heic ? "heic" : "validation", status, message, false, false);
  }

  if (status === 403 || status === 404) return failure("validation", status, detailMessage(problem), false, false);

  return failure("unknown", status, detailMessage(problem), false, true);
}

export function retryDelayMs(
  attemptIndex: number,
  retryAfterSeconds: number | null,
  delays: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
  maxRetryAfterMs: number = DEFAULT_MAX_RETRY_AFTER_MS,
): number | null {
  const base = delays[attemptIndex];
  if (base === undefined) return null;
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(Math.max(retryAfterSeconds * 1000, MIN_RETRY_AFTER_MS), maxRetryAfterMs);
  }
  return base;
}

export function totalAttempts(delays: readonly number[] = DEFAULT_RETRY_DELAYS_MS): number {
  return delays.length + 1;
}

export function uploadProgress(loaded: number, total: number): number {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(0.99, Math.max(0, loaded / total));
}

const UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toString().replace(".", ",")} ${UNITS[unit]}`;
}

export function generateClientUploadId(random: (bytes: Uint8Array) => Uint8Array = defaultRandom): string {
  const bytes = random(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function defaultRandom(bytes: Uint8Array): Uint8Array {
  return globalThis.crypto.getRandomValues(bytes);
}
