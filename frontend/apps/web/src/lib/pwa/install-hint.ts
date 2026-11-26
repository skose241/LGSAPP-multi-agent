export type InstallPlatform = "ios" | "android" | "other";

export interface PlatformInput {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

export const DISMISS_KEY = "lgs.installHint.dismissedAt";
export const DISMISS_DAYS = 30;

export function detectPlatform({ userAgent, platform = "", maxTouchPoints = 0 }: PlatformInput): InstallPlatform {
  if (/Android/i.test(userAgent)) return "android";
  const iPadOs = platform === "MacIntel" && maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(userAgent) || iPadOs) return "ios";
  return "other";
}

export function isIosSafari(userAgent: string): boolean {
  return /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent);
}

export function isStandaloneMode(input: { displayModeStandalone: boolean; navigatorStandalone?: boolean }): boolean {
  return input.displayModeStandalone || input.navigatorStandalone === true;
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function isDismissed(storage: ReadableStorage | null, now: number): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return now - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function rememberDismissal(storage: WritableStorage | null, now: number): void {
  if (!storage) return;
  try {
    storage.setItem(DISMISS_KEY, String(now));
  } catch {
    return;
  }
}
