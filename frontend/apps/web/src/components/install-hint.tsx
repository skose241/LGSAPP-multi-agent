"use client";

import { Download, Share, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  detectPlatform,
  isDismissed,
  isIosSafari,
  isStandaloneMode,
  rememberDismissal,
} from "@/lib/pwa/install-hint";
import { clearInstallEvent, getInstallState, subscribeInstallState } from "@/lib/pwa/install-prompt";

interface Environment {
  platform: "ios" | "android" | "other";
  iosSafari: boolean;
  standalone: boolean;
  dismissed: boolean;
}

const serverEnvironment: Environment = { platform: "other", iosSafari: false, standalone: true, dismissed: true };
let cachedEnvironment: Environment | null = null;

function readEnvironment(): Environment {
  if (cachedEnvironment) return cachedEnvironment;
  const nav = navigator as Navigator & { standalone?: boolean };
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  cachedEnvironment = {
    platform: detectPlatform({
      userAgent: nav.userAgent,
      platform: nav.platform,
      maxTouchPoints: nav.maxTouchPoints,
    }),
    iosSafari: isIosSafari(nav.userAgent),
    standalone: isStandaloneMode({
      displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
      navigatorStandalone: nav.standalone,
    }),
    dismissed: isDismissed(storage, Date.now()),
  };
  return cachedEnvironment;
}

const noopSubscribe = () => () => undefined;

export function InstallHint() {
  const environment = useSyncExternalStore(noopSubscribe, readEnvironment, () => serverEnvironment);
  const install = useSyncExternalStore(subscribeInstallState, getInstallState, getInstallState);
  const [closed, setClosed] = useState(false);

  if (closed || environment.standalone || environment.dismissed || install.installed) return null;

  const showAndroid = environment.platform === "android" && install.event !== null;
  const showIos = environment.platform === "ios" && environment.iosSafari;
  if (!showAndroid && !showIos) return null;

  function dismiss() {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    rememberDismissal(storage, Date.now());
    setClosed(true);
  }

  async function installApp() {
    const event = install.event;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    clearInstallEvent();
  }

  return (
    <Card role="region" aria-label="Uygulamayı Ana Ekrana Ekle" className="lg:hidden">
      <div className="flex items-start gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground">
          {showAndroid ? <Download className="size-5" aria-hidden="true" /> : <Share className="size-5" aria-hidden="true" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-base font-semibold">Uygulamayı ana ekrana ekle</p>
          {showAndroid ? (
            <>
              <p className="text-sm text-muted-foreground">Tek dokunuşla açmak için LGS Hazırlık uygulamasını telefonunuza yükleyin.</p>
              <div>
                <Button onClick={installApp}>Ana Ekrana Ekle</Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Safari&apos;de alttaki <strong>Paylaş</strong> düğmesine, ardından <strong>Ana Ekrana Ekle</strong> seçeneğine dokunun.
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Öneriyi Kapat" className="-mr-2 -mt-2">
          <X aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}
