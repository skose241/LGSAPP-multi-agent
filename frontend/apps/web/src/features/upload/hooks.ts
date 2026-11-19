"use client";

import type { UploadItem, UploadQueue } from "@lgs/api";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LEAVE_MESSAGE, shouldGuardNavigation } from "@/lib/upload/leave-guard";
import { createWebUploadQueue } from "@/lib/upload/web-queue";

export function useUploadQueue<TMeta = undefined>(concurrency?: number): UploadQueue<TMeta> {
  const [queue] = useState(() => createWebUploadQueue<TMeta>(concurrency ? { concurrency } : {}));
  useEffect(() => () => queue.abortAll(), [queue]);
  return queue;
}

export function useQueueItems<TMeta>(queue: UploadQueue<TMeta>): readonly UploadItem<TMeta>[] {
  return useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
}

export function useBeforeUnload(active: boolean, message: string = LEAVE_MESSAGE) {
  useEffect(() => {
    if (!active) return;
    function handler(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      const anchor = target instanceof HTMLAnchorElement ? target : null;
      const guard = shouldGuardNavigation(event, anchor, {
        origin: window.location.origin,
        pathname: window.location.pathname,
        search: window.location.search,
      });
      if (!guard) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", handler);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", handler);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, message]);
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const created = URL.createObjectURL(blob);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [blob]);
  return url;
}

export function useNow(active: boolean, intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}
