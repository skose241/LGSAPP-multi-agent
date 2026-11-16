const PREFIX = "lgs:taslak:";
const MAX_LENGTH = 20_000;

const OWNER_KEY = "lgs:taslak-sahibi";

interface StorageLike {
  readonly length?: number;
  key?(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: string, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    if (value.trim() === "") {
      storage.removeItem(PREFIX + key);
      return true;
    }
    storage.setItem(PREFIX + key, value.slice(0, MAX_LENGTH));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(key: string, storage: StorageLike | null = defaultStorage()): string {
  if (!storage) return "";
  try {
    return storage.getItem(PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

export function clearDraft(key: string, storage: StorageLike | null = defaultStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(PREFIX + key);
  } catch {
    return;
  }
}

export function clearAllDrafts(storage: StorageLike | null = defaultStorage()) {
  if (!storage) return;
  try {
    const keys: string[] = [];
    const total = storage.length ?? 0;
    for (let index = 0; index < total; index += 1) {
      const key = storage.key?.(index);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    storage.removeItem(OWNER_KEY);
  } catch {
    return;
  }
}

export function adoptDraftOwner(userId: number | string, storage: StorageLike | null = defaultStorage()) {
  if (!storage) return;
  try {
    const owner = String(userId);
    if (storage.getItem(OWNER_KEY) !== owner) {
      clearAllDrafts(storage);
      storage.setItem(OWNER_KEY, owner);
    }
  } catch {
    return;
  }
}
