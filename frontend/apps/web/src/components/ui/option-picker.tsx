"use client";

import { Check, X } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { OPTION_LETTERS } from "@lgs/api";
import { cn } from "@/lib/utils";

export interface OptionPickerProps {
  value: string | undefined;
  onValueChange?: (value: string) => void;
  correct?: string;
  revealed?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function OptionPicker({
  value,
  onValueChange,
  correct,
  revealed = false,
  disabled = false,
  label = "Şıklar",
  className,
}: OptionPickerProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const locked = disabled || revealed;
  const focusable = value && OPTION_LETTERS.includes(value as (typeof OPTION_LETTERS)[number]) ? value : OPTION_LETTERS[0];

  function move(index: number, step: number) {
    const next = (index + step + OPTION_LETTERS.length) % OPTION_LETTERS.length;
    const letter = OPTION_LETTERS[next];
    if (!letter) return;
    onValueChange?.(letter);
    refs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (locked) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(index, -1);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={locked || undefined}
      className={cn("grid grid-cols-4 gap-2 md:gap-3", className)}
    >
      {OPTION_LETTERS.map((letter, index) => {
        const selected = value === letter;
        const isCorrect = revealed && correct === letter;
        const isWrong = revealed && selected && correct !== letter;

        return (
          <button
            key={letter}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${letter} şıkkı${isCorrect ? ", doğru cevap" : ""}${isWrong ? ", yanlış seçim" : ""}`}
            tabIndex={focusable === letter ? 0 : -1}
            disabled={disabled && !revealed}
            aria-disabled={locked || undefined}
            onClick={() => {
              if (!locked) onValueChange?.(letter);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "relative flex h-16 flex-col items-center justify-center rounded-md border-2 font-display text-2xl font-bold transition-colors",
              locked ? "cursor-default" : "hover:border-primary hover:bg-primary-soft",
              "border-border-strong bg-surface text-foreground",
              selected && !revealed && "border-primary bg-primary-soft text-primary-soft-foreground",
              isCorrect && "border-correct bg-correct-soft text-correct-soft-foreground",
              isWrong && "border-wrong bg-wrong-soft text-wrong-soft-foreground",
              revealed && !isCorrect && !isWrong && "border-border bg-surface-muted text-muted-foreground",
              disabled && !revealed && "opacity-60",
            )}
          >
            {letter}
            {isCorrect ? <Check className="absolute right-1.5 top-1.5 size-4" aria-hidden="true" /> : null}
            {isWrong ? <X className="absolute right-1.5 top-1.5 size-4" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}
