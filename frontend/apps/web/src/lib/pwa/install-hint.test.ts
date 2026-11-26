import { describe, expect, it } from "vitest";
import {
  DISMISS_DAYS,
  DISMISS_KEY,
  detectPlatform,
  isDismissed,
  isIosSafari,
  isStandaloneMode,
  rememberDismissal,
} from "./install-hint";

const iphoneSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const iphoneChrome =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const androidChrome =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("detectPlatform", () => {
  it("platformu tanır", () => {
    expect(detectPlatform({ userAgent: androidChrome })).toBe("android");
    expect(detectPlatform({ userAgent: iphoneSafari })).toBe("ios");
    expect(detectPlatform({ userAgent: desktop, platform: "Win32" })).toBe("other");
  });

  it("iPadOS masaüstü kimliğini dokunmatik ekranla ayırt eder", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
    expect(detectPlatform({ userAgent: mac, platform: "MacIntel", maxTouchPoints: 5 })).toBe("ios");
    expect(detectPlatform({ userAgent: mac, platform: "MacIntel", maxTouchPoints: 0 })).toBe("other");
  });
});

describe("isIosSafari", () => {
  it("yalnızca Safari için doğrudur", () => {
    expect(isIosSafari(iphoneSafari)).toBe(true);
    expect(isIosSafari(iphoneChrome)).toBe(false);
  });
});

describe("isStandaloneMode", () => {
  it("display-mode veya navigator.standalone ile doğrudur", () => {
    expect(isStandaloneMode({ displayModeStandalone: true })).toBe(true);
    expect(isStandaloneMode({ displayModeStandalone: false, navigatorStandalone: true })).toBe(true);
    expect(isStandaloneMode({ displayModeStandalone: false })).toBe(false);
  });
});

describe("kapatma kaydı", () => {
  const now = Date.UTC(2026, 10, 26);

  it("kayıt yokken gösterilir", () => {
    expect(isDismissed(memory(), now)).toBe(false);
    expect(isDismissed(null, now)).toBe(false);
  });

  it("kapatıldıktan sonra süre dolana kadar gizlenir", () => {
    const storage = memory();
    rememberDismissal(storage, now);
    expect(isDismissed(storage, now + 1000)).toBe(true);
    expect(isDismissed(storage, now + DISMISS_DAYS * 86_400_000 + 1)).toBe(false);
  });

  it("bozuk değeri yok sayar ve depolama hatasını yutar", () => {
    const storage = memory();
    storage.setItem(DISMISS_KEY, "abc");
    expect(isDismissed(storage, now)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
    };
    expect(isDismissed(broken, now)).toBe(false);
    expect(() => rememberDismissal(broken, now)).not.toThrow();
  });
});
