"use client";

import { fileMutations, type ImageInfo } from "@lgs/api/queries";
import type { UploadItem } from "@lgs/api";
import { useCallback, useState } from "react";
import { useBeforeUnload, useQueueItems, useUploadQueue } from "@/features/upload/hooks";
import { api } from "@/lib/api/client";

export interface PhotoAttachment {
  fileId: number | null;
  busy: boolean;
  failed: boolean;
  item: UploadItem<undefined> | null;
  existing: ImageInfo | null;
  pick: (file: File) => void;
  retry: () => void;
  cancel: () => void;
  remove: () => void;
  discardUnsaved: () => void;
  reset: () => void;
}

export function usePhotoAttachment(initial: ImageInfo | null | undefined = null): PhotoAttachment {
  const queue = useUploadQueue<undefined>(1);
  const items = useQueueItems(queue);
  const [existingRemoved, setExistingRemoved] = useState(false);
  const item = items[0] ?? null;
  const existing = initial && !existingRemoved ? initial : null;

  const discard = useCallback(
    (target: UploadItem<undefined> | null) => {
      if (!target) return;
      const removed = queue.remove(target.id);
      if (removed?.result) void fileMutations.remove(api(), removed.result.id).catch(() => null);
    },
    [queue],
  );

  const pick = useCallback(
    (file: File) => {
      discard(queue.getSnapshot()[0] ?? null);
      queue.add(file, "SolutionImage", undefined);
    },
    [discard, queue],
  );

  const remove = useCallback(() => {
    const current = queue.getSnapshot()[0] ?? null;
    if (current) discard(current);
    if (initial) setExistingRemoved(true);
  }, [discard, initial, queue]);

  const discardUnsaved = useCallback(() => {
    discard(queue.getSnapshot()[0] ?? null);
  }, [discard, queue]);

  const pending = item !== null && (item.status === "queued" || item.status === "preparing" || item.status === "uploading" || item.status === "waiting");
  const failed = item !== null && (item.status === "failed" || item.status === "cancelled");
  useBeforeUnload(pending);
  const fileId = item ? (item.status === "done" && item.result ? item.result.id : null) : existing ? existing.fileId : null;

  return {
    fileId,
    busy: pending,
    failed,
    item,
    existing: item ? null : existing,
    pick,
    retry: () => {
      if (item) queue.retry(item.id);
    },
    cancel: () => {
      if (item) queue.cancel(item.id);
    },
    remove,
    discardUnsaved,
    reset: () => {
      const current = queue.getSnapshot()[0];
      if (current) queue.remove(current.id);
      setExistingRemoved(false);
    },
  };
}
