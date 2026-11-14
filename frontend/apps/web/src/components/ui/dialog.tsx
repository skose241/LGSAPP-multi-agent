"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

interface DialogContentProps extends Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> {
  title: string;
  description: string;
  hideClose?: boolean;
  children: ReactNode;
}

export function DialogContent({ title, description, hideClose = false, className, children, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-neutral-900/50" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col gap-4 overflow-y-auto rounded-t-xl border border-border bg-surface p-5 pb-safe shadow-lg",
          "md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:p-6",
          className,
        )}
        {...props}
      >
        <div className="flex flex-col gap-1.5 pr-10">
          <DialogPrimitive.Title className="font-display text-xl font-bold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
        </div>
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            aria-label="Kapat"
            className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-pill text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
