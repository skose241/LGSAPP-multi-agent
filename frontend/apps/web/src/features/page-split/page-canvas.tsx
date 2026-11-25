"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { HANDLES, fromDrag, handlePosition, isBigEnough, moveRect, resizeRect, type HandleName, type Point, type Rect } from "@/lib/page-split/geometry";
import { cn } from "@/lib/utils";

export type CanvasMode = "draw" | "pan";

export interface CanvasBox {
  id: string;
  rect: Rect;
  number: number;
  option: string | undefined;
  transferred: boolean;
  suggested?: boolean;
  section?: string;
}

interface PageCanvasProps {
  imageUrl: string | null;
  loading: boolean;
  error: string | null;
  aspect: number;
  pageLabel: string;
  boxes: CanvasBox[];
  selectedId: string | null;
  mode: CanvasMode;
  zoom: number;
  disabled?: boolean;
  onSelect: (id: string | null) => void;
  onCreate: (rect: Rect) => void;
  onChange: (id: string, rect: Rect) => void;
  onDelete: (id: string) => void;
  onOption: (id: string, option: string) => void;
  onUndo: () => void;
}

type Drag =
  | { kind: "draw"; origin: Point }
  | { kind: "move"; id: string; origin: Point; rect: Rect }
  | { kind: "resize"; id: string; handle: HandleName; origin: Point; rect: Rect };

interface Preview {
  id: string | null;
  rect: Rect;
}

const STEP = 0.005;
const BIG_STEP = 0.02;

function percent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

const HANDLE_LABELS: Record<HandleName, string> = {
  nw: "Sol Üst",
  n: "Üst",
  ne: "Sağ Üst",
  e: "Sağ",
  se: "Sağ Alt",
  s: "Alt",
  sw: "Sol Alt",
  w: "Sol",
};

const HANDLE_CURSORS: Record<HandleName, string> = {
  nw: "cursor-nwse-resize",
  se: "cursor-nwse-resize",
  ne: "cursor-nesw-resize",
  sw: "cursor-nesw-resize",
  n: "cursor-ns-resize",
  s: "cursor-ns-resize",
  e: "cursor-ew-resize",
  w: "cursor-ew-resize",
};

export function PageCanvas({ imageUrl, loading, error, aspect, pageLabel, boxes, selectedId, mode, zoom, disabled = false, onSelect, onCreate, onChange, onDelete, onOption, onUndo }: PageCanvasProps) {
  const overlay = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const moved = useRef(false);
  const [preview, setPreviewState] = useState<Preview | null>(null);
  const previewRef = useRef<Preview | null>(null);

  function setPreview(next: Preview | null) {
    previewRef.current = next;
    setPreviewState(next);
  }

  function pointOf(event: PointerEvent): Point {
    const bounds = overlay.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return { x: 0, y: 0 };
    return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) };
  }

  function begin(event: PointerEvent, next: Drag) {
    overlay.current?.setPointerCapture(event.pointerId);
    drag.current = next;
    moved.current = false;
  }

  function onOverlayDown(event: PointerEvent) {
    if (disabled || mode !== "draw" || event.button !== 0) return;
    begin(event, { kind: "draw", origin: pointOf(event) });
  }

  function onBoxDown(event: PointerEvent, box: CanvasBox) {
    event.stopPropagation();
    if (disabled || event.button !== 0) return;
    onSelect(box.id);
    if (mode === "draw") begin(event, { kind: "move", id: box.id, origin: pointOf(event), rect: box.rect });
  }

  function onHandleDown(event: PointerEvent, box: CanvasBox, handle: HandleName) {
    event.stopPropagation();
    if (disabled || event.button !== 0) return;
    begin(event, { kind: "resize", id: box.id, handle, origin: pointOf(event), rect: box.rect });
  }

  function onMove(event: PointerEvent) {
    const active = drag.current;
    if (!active) return;
    const point = pointOf(event);
    const dx = point.x - active.origin.x;
    const dy = point.y - active.origin.y;
    if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) moved.current = true;
    if (active.kind === "draw") setPreview({ id: null, rect: fromDrag(active.origin, point) });
    else if (active.kind === "move") setPreview({ id: active.id, rect: moveRect(active.rect, dx, dy) });
    else setPreview({ id: active.id, rect: resizeRect(active.rect, active.handle, dx, dy) });
  }

  function finish(event: PointerEvent, commit: boolean) {
    const active = drag.current;
    drag.current = null;
    if (overlay.current?.hasPointerCapture(event.pointerId)) overlay.current.releasePointerCapture(event.pointerId);
    const result = previewRef.current;
    setPreview(null);
    if (!active) return;
    if (!commit || !moved.current || !result) {
      if (active.kind === "draw" && commit) onSelect(null);
      return;
    }
    if (active.kind === "draw") {
      if (isBigEnough(result.rect)) onCreate(result.rect);
    } else if (result.id) {
      onChange(result.id, result.rect);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (disabled) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      onUndo();
      return;
    }
    const selected = boxes.find((box) => box.id === selectedId);
    if (!selected) return;
    const step = event.altKey ? BIG_STEP : STEP;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const arrow = arrows[event.key];
    if (arrow) {
      event.preventDefault();
      onChange(selected.id, event.shiftKey ? resizeRect(selected.rect, "se", arrow[0], arrow[1]) : moveRect(selected.rect, arrow[0], arrow[1]));
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDelete(selected.id);
      return;
    }
    if (event.key === "Escape") {
      onSelect(null);
      return;
    }
    const letter = event.key.toUpperCase();
    if (!event.ctrlKey && !event.metaKey && !event.altKey && ["A", "B", "C", "D"].includes(letter)) {
      event.preventDefault();
      onOption(selected.id, letter);
    }
  }

  return (
    <div className="max-h-[75dvh] overflow-auto rounded-lg border border-border bg-surface-muted" data-testid="page-scroll">
      <div className="relative mx-auto" style={{ width: `${zoom * 100}%`, aspectRatio: String(aspect) }} data-testid="page-frame" data-zoom={zoom}>
        {imageUrl ? <img src={imageUrl} alt={pageLabel} draggable={false} className="pointer-events-none block size-full select-none bg-white" data-testid="page-image" /> : <div className="size-full bg-surface" />}
        {loading ? (
          <div role="status" aria-label="Sayfa Hazırlanıyor" className="absolute inset-0 flex items-center justify-center bg-surface/70">
            <Loader2 className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="absolute inset-x-3 top-3 rounded-md border border-danger bg-danger-soft p-3 text-sm font-medium text-danger-soft-foreground">
            {error}
          </p>
        ) : null}
        <div
          ref={overlay}
          role="group"
          aria-label="Çerçeve Çizme Alanı"
          data-testid="page-overlay"
          data-mode={mode}
          onKeyDown={onKeyDown}
          onPointerDown={onOverlayDown}
          onPointerMove={onMove}
          onPointerUp={(event) => finish(event, true)}
          onPointerCancel={(event) => finish(event, false)}
          className={cn("absolute inset-0", mode === "draw" ? "cursor-crosshair" : "cursor-grab")}
          style={{ touchAction: mode === "draw" ? "none" : "auto" }}
        >
          {boxes.map((box) => {
            const rect = preview?.id === box.id ? preview.rect : box.rect;
            const selected = box.id === selectedId;
            return (
              <div
                key={box.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${box.section ?? "Soru"} ${box.number}${box.option ? ` · ${box.option}` : ""} Çerçevesi${box.transferred ? ", Aktarıldı" : ""}${box.suggested ? ", Öneri" : ""}`}
                data-testid="split-box"
                data-box-id={box.id}
                data-number={box.number}
                data-selected={selected}
                data-suggested={box.suggested === true}
                data-option={box.option ?? ""}
                onPointerDown={(event) => onBoxDown(event, box)}
                onFocus={() => onSelect(box.id)}
                className={cn(
                  "absolute border-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary",
                  box.suggested && "border-dashed",
                  selected ? "z-10 border-primary bg-primary/15" : box.suggested ? "border-info bg-info/10" : box.transferred ? "border-success bg-success/10" : "border-accent bg-accent/10",
                  mode === "draw" && "cursor-move",
                )}
                style={{ left: percent(rect.x), top: percent(rect.y), width: percent(rect.width), height: percent(rect.height), touchAction: mode === "draw" ? "none" : "auto" }}
              >
                <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                  {box.number}
                  {box.option ? ` · ${box.option}` : ""}
                </span>
              </div>
            );
          })}
          {preview && preview.id === null ? (
            <div className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10" style={{ left: percent(preview.rect.x), top: percent(preview.rect.y), width: percent(preview.rect.width), height: percent(preview.rect.height) }} />
          ) : null}
          {boxes
            .filter((box) => box.id === selectedId)
            .flatMap((box) => {
              const rect = preview?.id === box.id ? preview.rect : box.rect;
              return HANDLES.map((handle) => {
                const position = handlePosition(rect, handle);
                return (
                  <div
                    key={`${box.id}-${handle}`}
                    role="presentation"
                    data-testid={`handle-${handle}`}
                    title={`${HANDLE_LABELS[handle]} Tutamaç`}
                    onPointerDown={(event) => onHandleDown(event, box, handle)}
                    className={cn("absolute z-20 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center", HANDLE_CURSORS[handle])}
                    style={{ left: percent(position.x), top: percent(position.y), touchAction: "none" }}
                  >
                    <span className="block size-3.5 rounded-full border-2 border-primary bg-white" />
                  </div>
                );
              });
            })}
        </div>
      </div>
    </div>
  );
}
