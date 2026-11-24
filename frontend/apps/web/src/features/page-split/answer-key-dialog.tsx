"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/field";
import { parseAnswerKey } from "@/lib/page-split/answer-key";

interface AnswerKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxCount: number;
  startNumber: number;
  onStartNumberChange: (value: number) => void;
  onApply: (answers: Map<number, string>) => void;
}

export function AnswerKeyDialog({ open, onOpenChange, boxCount, startNumber, onStartNumberChange, onApply }: AnswerKeyDialogProps) {
  const textId = useId();
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseAnswerKey(text, startNumber), [text, startNumber]);
  const count = parsed.answers.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Cevap Anahtarı" description="Cevapları numarasıyla ya da ardışık harflerle yazın. Örnek: 1A 2C 3B veya ACBD. Cevaplar çerçevelere okuma sırasına göre uygulanır.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={textId} className="text-sm font-semibold">
              Cevaplar
            </label>
            <textarea
              id={textId}
              value={text}
              onChange={(event) => setText(event.target.value)}
              data-testid="answer-key-text"
              className="min-h-28 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-base hover:border-neutral-600 focus-visible:border-primary"
            />
          </div>
          <TextField
            label="İlk Çerçevenin Numarası"
            type="number"
            min={1}
            max={999}
            value={startNumber}
            onChange={(event) => onStartNumberChange(Math.max(1, Math.min(999, Math.round(Number(event.target.value)) || 1)))}
            hint="Çerçeveler bu numaradan başlayarak okuma sırasına göre numaralanır."
            className="max-w-xs"
          />
          <p role="status" className="text-sm text-muted-foreground" data-testid="answer-key-summary">
            {count === 0 ? "Henüz cevap okunmadı." : `${count} cevap okundu, ${boxCount} çerçeve var.`}
            {parsed.invalid.length > 0 ? ` Anlaşılamayanlar: ${parsed.invalid.slice(0, 8).join(", ")}` : ""}
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Vazgeç
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={count === 0}
            data-testid="answer-key-apply"
            onClick={() => {
              onApply(parsed.answers);
              onOpenChange(false);
            }}
          >
            Cevapları Uygula
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
