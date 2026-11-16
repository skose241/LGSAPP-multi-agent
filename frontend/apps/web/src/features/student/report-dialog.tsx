"use client";

import { isApiError, reportReasonLabel, reportReasonsFor, type ReportReasonValue } from "@lgs/api";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  target: "question" | "solution" | "comment";
  minLength: number;
  answered?: boolean;
  submit: (reason: ReportReasonValue, description: string) => Promise<unknown>;
}

const titles = { question: "Soruyu şikâyet et", solution: "Çözümü şikâyet et", comment: "Yorumu şikâyet et" } as const;

export function ReportDialog({ open, onOpenChange, onCloseAutoFocus, target, minLength, answered = true, submit }: ReportDialogProps) {
  const reasons = reportReasonsFor(target);
  const blocked = (value: ReportReasonValue) => value === "wrongAnswerKey" && !answered;
  const firstAllowed = reasons.find((value) => !blocked(value)) ?? "other";
  const [reason, setReason] = useState<ReportReasonValue>(firstAllowed);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<ProblemState | null>(null);
  const counterId = useId();

  const mutation = useMutation({
    mutationFn: () => submit(reason, description.trim()),
    onSuccess: () => {
      toast.success("Şikâyetin öğretmenlere iletildi.");
      setDescription("");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      setError(
        isApiError(e)
          ? { status: e.status, problem: e.problem, at: Date.now() }
          : { status: 0, at: Date.now(), problem: { message: "Bağlantı kurulamadı. Tekrar dene.", fieldErrors: {}, formError: null, retryAfter: null } },
      );
    },
  });

  const length = description.trim().length;
  const ready = length >= minLength;

  return (
    <Dialog open={open} onOpenChange={(next) => (mutation.isPending ? undefined : onOpenChange(next))}>
      <DialogContent title={titles[target]} description="Şikâyetin inceleme için öğretmenlere gider. Nedenini kısaca açıkla." onCloseAutoFocus={onCloseAutoFocus}>
        <ProblemBanner state={error} conflictAsMessage />
        <SelectField
          label="Neden"
          hint={answered ? undefined : "Yanlış cevap anahtarı şikâyeti için önce soruyu cevaplamalısın."}
          value={reason} onChange={(event) => setReason(event.target.value as ReportReasonValue)}>
          {reasons.map((value) => (
            <option key={value} value={value} disabled={blocked(value)}>
              {reportReasonLabel(value)}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${counterId}-text`} className="text-sm font-semibold">
            Açıklama
          </label>
          <textarea
            id={`${counterId}-text`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-describedby={counterId}
            maxLength={1000}
            className="min-h-28 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-base hover:border-neutral-600 focus-visible:border-primary"
          />
          <p id={counterId} className={ready ? "text-xs text-muted-foreground" : "text-xs font-semibold text-warning-soft-foreground"} data-testid="report-counter">
            {length} / en az {minLength} karakter
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={mutation.isPending}>
              Vazgeç
            </Button>
          </DialogClose>
          <Button type="button" variant="danger" disabled={!ready} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Şikâyet et
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
