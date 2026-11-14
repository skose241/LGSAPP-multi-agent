"use client";

import type { ReactNode } from "react";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  error?: ProblemState | null;
  conflictAsMessage?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "primary",
  pending = false,
  error = null,
  conflictAsMessage = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent title={title} description={description}>
        <ProblemBanner state={error} conflictAsMessage={conflictAsMessage} />
        {children}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={pending}>
              Vazgeç
            </Button>
          </DialogClose>
          <Button type="button" variant={tone === "danger" ? "danger" : "primary"} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
