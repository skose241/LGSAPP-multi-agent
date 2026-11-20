"use client";

import { formatBytes, type UploadItem } from "@lgs/api";
import { AlertCircle, CheckCircle2, Loader2, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNow } from "@/features/upload/hooks";
import { cn } from "@/lib/utils";

interface UploadStatusProps {
  item: UploadItem<unknown>;
  label: string;
  onRetry: () => void;
  onCancel: () => void;
  className?: string;
}

function statusText(item: UploadItem<unknown>, now: number): string {
  switch (item.status) {
    case "queued":
      return "Sırada Bekliyor";
    case "preparing":
      return "Fotoğraf Hazırlanıyor";
    case "uploading":
      return item.attempt > 1 ? `Yükleniyor %${Math.round(item.progress * 100)} (Deneme ${item.attempt}/${item.maxAttempts})` : `Yükleniyor %${Math.round(item.progress * 100)}`;
    case "waiting": {
      const seconds = Math.max(0, Math.ceil(((item.nextRetryAt ?? now) - now) / 1000));
      return `${item.failure?.message ?? "Bağlantı sorunu."} ${seconds} sn sonra yeniden denenecek (deneme ${item.attempt}/${item.maxAttempts}).`;
    }
    case "done":
      return item.preparedBytes ? `Yüklendi (${formatBytes(item.preparedBytes)})` : "Yüklendi";
    case "cancelled":
      return "Yükleme İptal Edildi";
    case "failed":
      return item.failure?.message ?? "Yükleme başarısız oldu.";
  }
}

export function UploadStatus({ item, label, onRetry, onCancel, className }: UploadStatusProps) {
  const waiting = item.status === "waiting";
  const now = useNow(waiting);
  const pending = item.status === "queued" || item.status === "preparing" || item.status === "uploading" || waiting;
  const failed = item.status === "failed" || item.status === "cancelled";
  const determinate = item.status === "uploading" || item.status === "done";
  const percent = item.status === "done" ? 100 : Math.round(item.progress * 100);
  const canRetry = item.status === "cancelled" || (item.status === "failed" && (item.failure?.manualRetry ?? true));

  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="upload-status" data-status={item.status}>
      {pending || item.status === "done" ? (
        <div
          role="progressbar"
          aria-label={`${label} yükleme durumu`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={determinate ? percent : undefined}
          aria-valuetext={statusText(item, now)}
          className="h-2.5 overflow-hidden rounded-pill bg-primary-100"
        >
          <div
            className={cn(
              "h-full rounded-pill transition-[width]",
              item.status === "done" ? "bg-success" : "bg-primary",
              !determinate && "w-1/3 animate-pulse",
            )}
            style={determinate ? { width: `${percent}%` } : undefined}
          />
        </div>
      ) : null}

      <p
        role={failed ? "alert" : "status"}
        aria-live={failed ? "assertive" : "polite"}
        className={cn(
          "flex items-start gap-1.5 text-sm",
          failed ? "font-medium text-danger" : item.status === "done" ? "font-medium text-success-soft-foreground" : "text-muted-foreground",
        )}
      >
        {failed ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
        {item.status === "done" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
        {pending ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        <span data-testid="upload-message">{statusText(item, now)}</span>
      </p>

      {pending || canRetry ? (
        <div className="flex flex-wrap gap-2">
          {pending ? (
            <Button type="button" variant="secondary" className="h-11" onClick={onCancel} data-testid="upload-cancel">
              <X aria-hidden="true" />
              İptal
            </Button>
          ) : null}
          {canRetry ? (
            <Button type="button" variant="secondary" className="h-11" onClick={onRetry} data-testid="upload-retry">
              <RotateCw aria-hidden="true" />
              Tekrar Dene
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
