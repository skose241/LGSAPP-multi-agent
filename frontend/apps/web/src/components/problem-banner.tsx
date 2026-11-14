"use client";

import type { ParsedProblem } from "@lgs/api";
import { AlertTriangle, Clock, RefreshCw, ServerCrash } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function useCountdown(seconds: number | null | undefined, token: unknown): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!seconds || seconds <= 0) {
      setRemaining(0);
      return;
    }
    const endsAt = Date.now() + seconds * 1000;
    setRemaining(seconds);
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [seconds, token]);

  return remaining;
}

export interface ProblemState {
  status: number;
  problem: ParsedProblem;
  at: number;
}

interface ProblemBannerProps {
  state: ProblemState | null;
  countdown?: number;
  onRetry?: () => void;
  className?: string;
}

export function ProblemBanner({ state, countdown = 0, onRetry, className }: ProblemBannerProps) {
  if (!state) return null;
  const { status, problem } = state;

  let Icon = AlertTriangle;
  let tone = "border-danger bg-danger-soft text-danger-soft-foreground";
  let text = problem.formError ?? problem.message;

  if (status === 429) {
    Icon = Clock;
    tone = "border-warning bg-warning-soft text-warning-soft-foreground";
    text =
      countdown > 0
        ? `Çok fazla deneme yapıldı. ${countdown} saniye sonra tekrar deneyebilirsin.`
        : "Şimdi tekrar deneyebilirsin.";
  } else if (status === 503 || status === 502 || status === 504 || status === 0) {
    Icon = ServerCrash;
    tone = "border-info bg-info-soft text-info-soft-foreground";
    text = status === 0 ? problem.message : "Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.";
  } else if (status === 409) {
    Icon = RefreshCw;
    tone = "border-warning bg-warning-soft text-warning-soft-foreground";
    text = "Kayıt başka biri tarafından değiştirilmiş. Güncel hali yüklendi, kontrol edip tekrar dene.";
  }

  return (
    <div
      role="alert"
      data-testid="problem-banner"
      className={cn("flex items-start gap-3 rounded-md border p-3 text-sm font-medium", tone, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p>{text}</p>
        {onRetry && status !== 429 && status !== 409 ? (
          <Button type="button" variant="ghost" className="mt-1 h-11 px-0" onClick={onRetry}>
            Tekrar dene
          </Button>
        ) : null}
      </div>
    </div>
  );
}
