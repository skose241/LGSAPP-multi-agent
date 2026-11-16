"use client";

import { fieldError, isApiError, letterToOption } from "@lgs/api";
import { commentKeys, questionKeys, questionMutations, solutionKeys, type AnswerResult, type QuestionDetail } from "@lgs/api/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { OptionPicker } from "@/components/ui/option-picker";
import { toProblemState } from "@/features/student/comment-node";
import { usePublicSettings } from "@/features/student/use-settings";
import { api } from "@/lib/api/client";
import { clearDraft, loadDraft, saveDraft } from "@/lib/session/draft";

interface AnswerFormProps {
  question: QuestionDetail;
  onAnswered: (result: AnswerResult) => void;
}

export function AnswerForm({ question, onAnswered }: AnswerFormProps) {
  const queryClient = useQueryClient();
  const settings = usePublicSettings();
  const draftKey = `cevap:${question.id}`;
  const [option, setOption] = useState<string | undefined>(undefined);
  const [text, setText] = useState("");
  const [error, setError] = useState<ProblemState | null>(null);
  const [textError, setTextError] = useState<string | undefined>(undefined);
  const counterId = useId();

  useEffect(() => {
    setText(loadDraft(draftKey));
  }, [draftKey]);

  const min = settings.data?.aciklamaMinKarakter ?? 20;
  const max = settings.data?.cozumMaxKarakter ?? 2000;
  const length = text.trim().length;
  const tooShort = length < min;
  const tooLong = length > max;

  const mutation = useMutation({
    mutationFn: () => {
      const selected = option ? (letterToOption(option) ?? 0) : 0;
      return questionMutations.submitAnswer(api(), question.id, selected, text.trim());
    },
    onSuccess: async (result) => {
      clearDraft(draftKey);
      onAnswered(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: questionKeys.all }),
        queryClient.invalidateQueries({ queryKey: solutionKeys.list(question.id) }),
        queryClient.invalidateQueries({ queryKey: commentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["assignments"] }),
      ]);
    },
    onError: async (e: unknown) => {
      const state = toProblemState(e);
      setTextError(fieldError(state.problem, "solutionText"));
      setError(state);
      if (isApiError(e) && e.status === 409) {
        await queryClient.invalidateQueries({ queryKey: questionKeys.detail(question.id) });
      }
    },
  });

  const hasTextOptions = Object.values(question.options).some(Boolean);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setTextError(undefined);
        if (option && !tooShort && !tooLong) mutation.mutate();
      }}
    >
      <ProblemBanner state={error} conflictAsMessage />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Cevabın</p>
        <OptionPicker value={option} onValueChange={setOption} label="Cevap şıkları" />
        {hasTextOptions ? null : <p className="text-xs text-muted-foreground">Soru görselindeki şıklardan birini seç.</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${counterId}-text`} className="text-sm font-semibold">
          Çözümünü anlat
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id={`${counterId}-text`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            saveDraft(draftKey, event.target.value);
          }}
          aria-describedby={`${counterId}-hint`}
          aria-invalid={Boolean(textError) || tooLong || undefined}
          placeholder="Soruyu nasıl çözdün? Nerede takıldın?"
          className="min-h-36 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-base hover:border-neutral-600 focus-visible:border-primary aria-invalid:border-danger aria-invalid:bg-danger-soft"
        />
        <p
          id={`${counterId}-hint`}
          data-testid="answer-counter"
          className={tooShort || tooLong ? "text-xs font-semibold text-warning-soft-foreground" : "text-xs text-muted-foreground"}
        >
          {length} / en az {min}, en fazla {max} karakter
        </p>
        {textError ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {textError}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={!option || tooShort || tooLong} loading={mutation.isPending}>
        Cevabı Gönder
      </Button>
    </form>
  );
}
