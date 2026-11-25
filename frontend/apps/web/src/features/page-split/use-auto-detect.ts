"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectAnswerKeys, type DocumentAnswerKey } from "@/lib/page-split/answer-key-detect";
import { SourceError, isAbort, type PageSource } from "@/lib/page-split/sources";
import { detectDocument, type PageDetection } from "@/lib/page-split/text-detect";
import type { TextFragment } from "@/lib/pdf/text-content";

export type AutoDetectScope = "page" | "all";

export interface AutoDetectOutcome {
  detections: PageDetection[];
  keys: DocumentAnswerKey;
  scope: number[];
}

export interface UseAutoDetect {
  busy: boolean;
  error: string | null;
  run(scope: AutoDetectScope, page: number): Promise<AutoDetectOutcome | null>;
  reset(): void;
}

export function useAutoDetect(source: PageSource | null): UseAutoDetect {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<{ source: PageSource; pages: TextFragment[][] } | null>(null);
  const ticket = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    ticket.current += 1;
    controller.current?.abort();
    controller.current = null;
  }, []);

  useEffect(() => {
    cache.current = null;
    cancel();
    setBusy(false);
    setError(null);
    return cancel;
  }, [source, cancel]);

  const run = useCallback(
    async (scope: AutoDetectScope, page: number): Promise<AutoDetectOutcome | null> => {
      if (!source || !source.textContent) return null;
      cancel();
      const mine = ticket.current;
      const abort = new AbortController();
      controller.current = abort;
      setBusy(true);
      setError(null);
      try {
        let pages = cache.current?.source === source ? cache.current.pages : null;
        if (!pages) {
          const loaded: TextFragment[][] = [];
          for (let index = 0; index < source.pageCount; index += 1) {
            loaded.push(await source.textContent(index, abort.signal));
            if (mine !== ticket.current) return null;
          }
          pages = loaded;
          cache.current = { source, pages };
        }
        const keys = detectAnswerKeys(pages);
        const detections = detectDocument(pages, { answerKeyFrom: keys.pages.map((entry) => (entry.isKey ? entry.fromY : null)) });
        const pageScope = scope === "all" ? pages.map((_, index) => index) : [page];
        return { detections: detections.filter((entry) => pageScope.includes(entry.page)), keys, scope: pageScope };
      } catch (failure) {
        if (mine === ticket.current && !isAbort(failure)) setError(failure instanceof SourceError ? failure.message : "Sayfa metni okunamadı. Çerçeveleri elle çizebilirsiniz.");
        return null;
      } finally {
        if (mine === ticket.current) {
          setBusy(false);
          controller.current = null;
        }
      }
    },
    [source, cancel],
  );

  const reset = useCallback(() => {
    cancel();
    setBusy(false);
    setError(null);
  }, [cancel]);

  return { busy, error, run, reset };
}
