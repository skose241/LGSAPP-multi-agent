"use client";

import { imageSource, type ImageInfo } from "@lgs/api/queries";
import { Maximize2 } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface QuestionImageProps {
  image: ImageInfo | null | undefined;
  alt: string;
  variant: "thumb" | "full";
  onExpired?: () => void | Promise<unknown>;
  zoomable?: boolean;
  className?: string;
  priority?: boolean;
}

export function QuestionImage({ image, alt, variant, onExpired, zoomable = false, className, priority = false }: QuestionImageProps) {
  const source = imageSource(image, variant);
  const retried = useRef(false);
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  if (!source) return null;
  const full = imageSource(image, "full");
  const failed = erroredUrl === source.url && !refreshing;

  function handleError() {
    const erroredSource = source?.url ?? null;
    setErroredUrl(erroredSource);
    if (!retried.current && onExpired) {
      retried.current = true;
      setRefreshing(true);
      Promise.resolve(onExpired())
        .catch(() => null)
        .finally(() => setRefreshing(false));
    }
  }

  if (refreshing && erroredUrl === source.url) {
    return (
      <div
        role="img"
        aria-label={alt}
        aria-busy="true"
        className={cn("bg-placeholder flex aspect-[4/3] w-full items-center justify-center rounded-md border border-border text-sm text-muted-foreground", className)}
      >
        Görsel yenileniyor
      </div>
    );
  }

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn("bg-placeholder flex aspect-[4/3] w-full items-center justify-center rounded-md border border-border text-sm text-muted-foreground", className)}
      >
        Görsel yüklenemedi
      </div>
    );
  }

  const picture = (
    <Image
      key={source.url}
      src={source.url}
      alt={alt}
      width={source.width}
      height={source.height}
      unoptimized
      priority={priority}
      onError={handleError}
      className={cn("h-auto w-full rounded-md border border-border bg-surface-muted object-contain", className)}
    />
  );

  if (!zoomable || !full) return picture;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${alt} (tam ekran)`}
        className="group relative block w-full rounded-md"
      >
        {picture}
        <span className="absolute bottom-2 right-2 flex size-11 items-center justify-center rounded-pill bg-neutral-900/70 text-white">
          <Maximize2 className="size-5" aria-hidden="true" />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Soru görseli" description={alt} className="md:max-w-5xl">
          <div className="overflow-auto rounded-md bg-surface-muted">
            <Image src={full.url} alt={alt} width={full.width} height={full.height} unoptimized className="mx-auto h-auto max-h-[70dvh] w-auto max-w-full object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
