"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

export interface ActionMenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "danger";
  onSelect: () => void;
}

export function ActionMenu({
  label,
  items,
  className,
  triggerRef: externalTriggerRef,
}: {
  label: string;
  items: ActionMenuItem[];
  className?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"right" | "left">("right");
  const rootRef = useRef<HTMLDivElement>(null);
  const ownTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = externalTriggerRef ?? ownTriggerRef;
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !triggerRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const width = menuRef.current.offsetWidth;
    const fitsRight = trigger.right - width >= 8;
    const fitsLeft = trigger.left + width <= window.innerWidth - 8;
    setAlign(!fitsRight && fitsLeft ? "left" : "right");
  }, [open, triggerRef]);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  if (items.length === 0) return null;

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nodes[(current + 1) % nodes.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nodes[(current - 1 + nodes.length) % nodes.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      nodes[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-md px-3 text-foreground hover:bg-surface-muted"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn("absolute top-full z-30 mt-1 flex min-w-44 max-w-[calc(100vw-1rem)] flex-col rounded-md border border-border bg-surface p-1 shadow-lg", align === "left" ? "left-0" : "right-0")}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
              className={cn(
                "inline-flex min-h-touch w-full items-center gap-2 rounded-sm px-3 text-left text-sm font-semibold hover:bg-surface-muted focus-visible:bg-surface-muted [&_svg]:size-4",
                item.tone === "danger" ? "text-danger" : "text-foreground",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
