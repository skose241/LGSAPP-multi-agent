"use client";

import { classifyAiRequestFailure, isApiError, normalizeAiState, quotaSummary, type AiRequestFailure } from "@lgs/api";
import {
  aiKeys,
  aiMutations,
  aiQuotaQuery,
  questionKeys,
  solutionKeys,
  type QuestionDetail as QuestionDetailData,
  type Solution,
} from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, ServerCrash } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AiSolutionPanel, type AiPanelState } from "@/components/ai-solution-panel";
import { MathText } from "@/components/math-text";
import { useCountdown } from "@/components/problem-banner";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface FailureState extends AiRequestFailure {
  at: number;
}

function toFailure(error: unknown): FailureState {
  if (isApiError(error)) {
    return { ...classifyAiRequestFailure(error.status, error.problem.message, error.problem.retryAfter), at: Date.now() };
  }
  return {
    ...classifyAiRequestFailure(0, "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.", null),
    at: Date.now(),
  };
}

function FailureNotice({ failure, countdown }: { failure: FailureState; countdown: number }) {
  let Icon = AlertTriangle;
  let tone = "border-danger bg-danger-soft text-danger-soft-foreground";
  let text = failure.message;

  if (failure.kind === "rateLimit") {
    Icon = Clock;
    tone = "border-warning bg-warning-soft text-warning-soft-foreground";
    text =
      countdown > 0
        ? `Kısa sürede çok fazla istek gönderdiniz. ${countdown} saniye sonra tekrar deneyebilirsiniz.`
        : "Şimdi tekrar deneyebilirsiniz.";
  } else if (failure.kind === "providerDown") {
    Icon = ServerCrash;
    tone = "border-info bg-info-soft text-info-soft-foreground";
    text =
      countdown > 0
        ? `${failure.message} Bu denemede hakkınız düşmedi. ${countdown} saniye sonra tekrar deneyebilirsiniz.`
        : `${failure.message} Bu denemede hakkınız düşmedi. Şimdi tekrar deneyebilirsiniz.`;
  } else if (failure.kind === "dailyLimit") {
    Icon = Clock;
    tone = "border-warning bg-warning-soft text-warning-soft-foreground";
  }

  return (
    <div role="alert" data-testid="ai-notice" data-kind={failure.kind} className={cn("flex items-start gap-3 rounded-md border p-3 text-sm font-medium", tone)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

export function AiSolutionSection({ question, aiSolution, actions }: { question: QuestionDetailData; aiSolution: Solution | undefined; actions?: ReactNode }) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<FailureState | null>(null);

  const rawState = normalizeAiState(question.aiSolutionState);
  const state: AiPanelState = rawState === "available" && !aiSolution ? "none" : rawState;
  const canRequest = question.permissions.canRequestAiSolution && state === "none";

  const quota = useQuery(aiQuotaQuery(api(), canRequest));
  const summary = quota.data ? quotaSummary(quota.data) : null;
  const countdown = useCountdown(failure?.retryAfter, failure?.at);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: questionKeys.detail(question.id) }),
      queryClient.invalidateQueries({ queryKey: solutionKeys.list(question.id) }),
      queryClient.invalidateQueries({ queryKey: aiKeys.quota }),
    ]);
  };

  const mutation = useMutation({
    mutationFn: () => aiMutations.requestSolution(api(), question.id),
    onMutate: () => {
      setFailure(null);
    },
    onSuccess: async (result) => {
      if (result.status === "created") {
        toast.success("Yapay zekâ çözümü hazır.");
      }
      await refresh();
    },
    onError: async (error: unknown) => {
      const next = toFailure(error);
      setFailure(next);
      if (next.kind !== "rateLimit" && next.kind !== "providerDown" && next.kind !== "network") {
        await refresh();
      }
    },
  });

  const request = () => {
    if (!mutation.isPending) mutation.mutate();
  };

  if (mutation.isPending) {
    return <AiSolutionPanel state="loading" />;
  }

  const solutionNode: ReactNode = aiSolution?.text ? <MathText text={aiSolution.text} className="max-w-prose text-base" /> : undefined;

  if (state !== "none") {
    return <AiSolutionPanel state={state} solution={solutionNode} actions={state === "available" && aiSolution ? actions : undefined} />;
  }

  const blockedByDaily = failure?.kind === "dailyLimit";
  const waiting = (failure?.kind === "rateLimit" || failure?.kind === "providerDown") && countdown > 0;
  const quotaBlocked = summary ? !summary.canRequest : false;
  const requestDisabled = blockedByDaily || waiting;

  return (
    <AiSolutionPanel
      state="none"
      quotaText={canRequest ? summary?.text : undefined}
      onRequest={canRequest && !quotaBlocked ? request : undefined}
      requestDisabled={requestDisabled}
      notice={failure ? <FailureNotice failure={failure} countdown={countdown} /> : null}
    />
  );
}
