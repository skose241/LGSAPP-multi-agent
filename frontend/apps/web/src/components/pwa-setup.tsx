"use client";

import { useEffect } from "react";
import { startInstallCapture } from "@/lib/pwa/install-prompt";

export function PwaSetup() {
  useEffect(() => {
    startInstallCapture();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}
