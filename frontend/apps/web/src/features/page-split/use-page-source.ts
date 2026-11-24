"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useObjectUrl } from "@/features/upload/hooks";
import type { Rotation } from "@/lib/page-split/geometry";
import { SourceError, isAbort, type PageSource } from "@/lib/page-split/sources";

export type SourceStatus = "idle" | "loading" | "ready" | "error";

export interface UsePageSource {
  source: PageSource | null;
  status: SourceStatus;
  error: string | null;
  openPdf(file: File): Promise<PageSource | null>;
  openPhotos(files: File[]): Promise<PageSource | null>;
  close(): void;
}

function messageOf(error: unknown): string {
  if (error instanceof SourceError) return error.message;
  return "Dosya açılamadı. Tekrar deneyin ya da başka bir dosya seçin.";
}

export function usePageSource(): UsePageSource {
  const [source, setSource] = useState<PageSource | null>(null);
  const [status, setStatus] = useState<SourceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const current = useRef<PageSource | null>(null);
  const ticket = useRef(0);

  const replace = useCallback((next: PageSource | null) => {
    current.current?.dispose();
    current.current = next;
    setSource(next);
  }, []);

  useEffect(
    () => () => {
      ticket.current += 1;
      current.current?.dispose();
      current.current = null;
    },
    [],
  );

  const run = useCallback(
    async (open: () => Promise<PageSource>): Promise<PageSource | null> => {
      ticket.current += 1;
      const mine = ticket.current;
      setStatus("loading");
      setError(null);
      try {
        const opened = await open();
        if (mine !== ticket.current) {
          opened.dispose();
          return null;
        }
        replace(opened);
        setStatus("ready");
        return opened;
      } catch (failure) {
        if (mine !== ticket.current) return null;
        setError(messageOf(failure));
        setStatus(current.current ? "ready" : "error");
        return null;
      }
    },
    [replace],
  );

  const openPdf = useCallback(
    (file: File) =>
      run(async () => {
        const [{ loadPdfjs }, { openPdfSource }] = await Promise.all([import("@/lib/pdf/pdfjs"), import("@/lib/pdf/pdf-source")]);
        const lib = await loadPdfjs();
        return openPdfSource(lib, file);
      }),
    [run],
  );

  const openPhotos = useCallback(
    (files: File[]) =>
      run(async () => {
        const [{ openImageSource }, { browserImageDeps }] = await Promise.all([import("@/lib/page-split/image-source"), import("@/lib/image/browser")]);
        return openImageSource(files, browserImageDeps);
      }),
    [run],
  );

  const close = useCallback(() => {
    ticket.current += 1;
    replace(null);
    setStatus("idle");
    setError(null);
  }, [replace]);

  return { source, status, error, openPdf, openPhotos, close };
}

export function usePagePreview(source: PageSource | null, page: number, rotation: Rotation, maxEdge: number, enabled = true) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source || !enabled) return;
    const controller = new AbortController();
    setBlob(null);
    setError(null);
    source
      .renderPreview(page, maxEdge, rotation, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setBlob(result);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || isAbort(failure)) return;
        setError(messageOf(failure));
      });
    return () => controller.abort();
  }, [source, page, rotation, maxEdge, enabled]);

  const url = useObjectUrl(blob);
  return { url, error, loading: enabled && !url && !error };
}
