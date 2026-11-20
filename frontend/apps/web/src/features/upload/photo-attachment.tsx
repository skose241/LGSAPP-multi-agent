"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useId, type ChangeEvent } from "react";
import { QuestionImage } from "@/components/question-image";
import { Button } from "@/components/ui/button";
import { UploadStatus } from "@/features/upload/upload-status";
import { useObjectUrl } from "@/features/upload/hooks";
import type { PhotoAttachment as PhotoAttachmentController } from "@/features/upload/use-photo-attachment";

interface PhotoAttachmentProps {
  controller: PhotoAttachmentController;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function PhotoAttachment({ controller, label, hint, disabled = false }: PhotoAttachmentProps) {
  const inputId = useId();
  const { item, existing } = controller;
  const previewUrl = useObjectUrl(item?.previewBlob ?? null);
  const hasPhoto = item !== null || existing !== null;

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) controller.pick(file);
  }

  return (
    <div className="flex flex-col gap-2" data-testid="photo-attachment">
      <p className="text-sm font-semibold">{label}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

      {existing ? (
        <div className="max-w-xs">
          <QuestionImage image={existing} alt="Çözüm Fotoğrafı" variant="thumb" />
        </div>
      ) : null}

      {previewUrl ? (
        <img src={previewUrl} alt="Eklenen fotoğraf önizlemesi" className="max-h-56 w-auto max-w-full self-start rounded-md border border-border object-contain" />
      ) : null}

      {item ? <UploadStatus item={item} label={label} onRetry={controller.retry} onCancel={controller.cancel} /> : null}

      <div className="flex flex-wrap gap-2">
        <input id={inputId} type="file" accept="image/*" className="peer sr-only" disabled={disabled} onChange={onChange} data-testid="photo-input" />
        <label
          htmlFor={inputId}
          className="inline-flex h-11 min-h-touch cursor-pointer items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-base font-semibold text-foreground hover:bg-surface-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
        >
          <ImagePlus className="size-5" aria-hidden="true" />
          {hasPhoto ? "Fotoğrafı Değiştir" : "Fotoğraf Ekle"}
        </label>
        {hasPhoto ? (
          <Button type="button" variant="secondary" className="h-11" onClick={controller.remove} disabled={disabled}>
            <Trash2 aria-hidden="true" />
            Fotoğrafı Kaldır
          </Button>
        ) : null}
      </div>
    </div>
  );
}
