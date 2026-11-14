let codes: string[] | null = null;

export function holdRecoveryCodes(value: string[]) {
  codes = [...value];
}

export function peekRecoveryCodes(): string[] | null {
  return codes ? [...codes] : null;
}

export function clearRecoveryCodes() {
  codes = null;
}
