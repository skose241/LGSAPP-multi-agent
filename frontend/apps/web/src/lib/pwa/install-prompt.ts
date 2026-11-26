export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallState {
  event: InstallPromptEvent | null;
  installed: boolean;
}

let state: InstallState = { event: null, installed: false };
let capturing = false;
const listeners = new Set<() => void>();

function update(next: InstallState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function startInstallCapture(target: Window = window) {
  if (capturing) return;
  capturing = true;
  target.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    update({ event: event as InstallPromptEvent, installed: false });
  });
  target.addEventListener("appinstalled", () => update({ event: null, installed: true }));
}

export function subscribeInstallState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallState(): InstallState {
  return state;
}

export function clearInstallEvent() {
  update({ ...state, event: null });
}
