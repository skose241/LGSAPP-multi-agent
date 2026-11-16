"use client";

import { formatDateTimeShort, isApiError, normalizeAiState, optionToLetter, questionSourceLabel } from "@lgs/api";
import {
  questionKeys,
  questionMutations,
  questionQuery,
  type AnswerResult,
  type QuestionDetail as QuestionDetailData,
} from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, CloudOff, Flag, Lock, ThumbsUp, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AiSolutionPanel } from "@/components/ai-solution-panel";
import { EmptyState } from "@/components/empty-state";
import { MathText } from "@/components/math-text";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OptionPicker } from "@/components/ui/option-picker";
import { AnswerForm } from "@/features/student/answer-form";
import { CommentSection } from "@/features/student/comment-section";
import { ReportDialog } from "@/features/student/report-dialog";
import { SolutionsSection } from "@/features/student/solutions-section";
import { usePublicSettings } from "@/features/student/use-settings";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

function LikeButton({ question }: { question: QuestionDetailData }) {
  const queryClient = useQueryClient();
  const key = questionKeys.detail(question.id);

  const mutation = useMutation({
    mutationFn: (next: boolean) => (next ? questionMutations.like(api(), question.id) : questionMutations.unlike(api(), question.id)),
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<QuestionDetailData>(key);
      if (previous) {
        queryClient.setQueryData<QuestionDetailData>(key, {
          ...previous,
          likedByMe: next,
          likeCount: Math.max(0, (previous.likeCount ?? 0) + (next ? 1 : -1)),
        });
      }
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return (
    <Button
      type="button"
      variant={question.likedByMe ? "primary" : "secondary"}
      aria-pressed={question.likedByMe}
      onClick={() => mutation.mutate(!question.likedByMe)}
      data-testid="like-button"
    >
      <ThumbsUp aria-hidden="true" />
      <span>{question.likedByMe ? "Beğendin" : "Beğen"}</span>
      <span data-testid="like-count">{question.likeCount ?? 0}</span>
    </Button>
  );
}

function ResultCard({ question, result }: { question: QuestionDetailData; result: AnswerResult | null }) {
  const mine = question.myAnswer;
  if (!mine) return null;
  const correct = question.correctOption ?? result?.correctOption ?? null;
  const letter = correct ? optionToLetter(correct) : null;

  return (
    <div
      role="status"
      data-testid="answer-result"
      className={cn(
        "flex items-start gap-3 rounded-md border p-4",
        mine.isCorrect ? "border-correct bg-correct-soft text-correct-soft-foreground" : "border-wrong bg-wrong-soft text-wrong-soft-foreground",
      )}
    >
      {mine.isCorrect ? <CheckCircle2 className="mt-0.5 size-6 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 size-6 shrink-0" aria-hidden="true" />}
      <div>
        <p className="font-display text-lg font-bold">{mine.isCorrect ? "Doğru cevap!" : "Bu sefer olmadı"}</p>
        <p className="text-sm">
          Cevabın: {optionToLetter(mine.selectedOption) ?? "-"}
          {letter ? ` · Doğru cevap: ${letter}` : ""}
        </p>
        {result ? (
          <p className="text-sm font-semibold" data-testid="points-earned">
            Kazandığın puan: {result.pointsEarned}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function QuestionDetail({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const question = useQuery(questionQuery(api(), id));
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [reporting, setReporting] = useState(false);
  const settings = usePublicSettings();

  if (question.isPending) {
    return <div role="status" aria-label="Soru yükleniyor" className="h-96 animate-pulse rounded-lg bg-surface-muted" />;
  }

  if (question.isError) {
    const missing = isApiError(question.error) && (question.error.status === 404 || question.error.status === 403);
    return (
      <EmptyState
        icon={CloudOff}
        as="h2"
        title={missing ? "Soru bulunamadı" : "Soru yüklenemedi"}
        description={missing ? "Bu soruya erişemiyorsun ya da henüz yayında değil." : question.error.message}
        action={
          <Button asChild variant="secondary">
            <Link href="/sorular">Sorulara dön</Link>
          </Button>
        }
      />
    );
  }

  const q = question.data;
  const aiState = normalizeAiState(q.aiSolutionState);
  const hasTextOptions = Object.values(q.options).some(Boolean);
  const optionEntries = (["a", "b", "c", "d"] as const).map((key, index) => ({ letter: "ABCD"[index] ?? "", text: q.options[key] }));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: questionKeys.detail(id) });

  return (
    <div className="flex flex-col gap-5">
      <Link href="/sorular" className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Sorular
      </Link>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="sr-only">{q.lesson.name} sorusu</h1>
                <Badge tone="primary">{q.lesson.name}</Badge>
                {q.topic ? <Badge tone="neutral">{q.topic.name}</Badge> : null}
                <Badge tone={q.source === "ai" ? "info" : q.source === "teacher" ? "accent" : "neutral"}>{questionSourceLabel(q.source)}</Badge>
                {q.author ? <span className="text-sm text-muted-foreground">{q.author.fullName || q.author.userName}</span> : null}
                <span className="text-xs text-muted-foreground">{formatDateTimeShort(q.publishedAt ?? q.createdAt)}</span>
              </div>

              {q.image ? <QuestionImage image={q.image} alt={`${q.lesson.name} sorusu`} variant="full" zoomable priority onExpired={refresh} /> : null}
              {q.text ? <MathText text={q.text} className="max-w-prose text-lg" /> : null}
              {hasTextOptions ? (
                <ol className="flex max-w-prose flex-col gap-1.5" aria-label="Şıklar">
                  {optionEntries
                    .filter((entry) => entry.text)
                    .map((entry) => (
                      <li key={entry.letter} className="flex gap-2">
                        <span className="font-display font-bold">{entry.letter})</span>
                        <MathText text={entry.text ?? ""} />
                      </li>
                    ))}
                </ol>
              ) : null}
              {q.description && q.permissions.canSeeOwnResult ? (
                <p className="max-w-prose whitespace-pre-wrap break-words text-sm text-muted-foreground">{q.description}</p>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <LikeButton question={q} />
                {q.permissions.canReport ? (
                  <Button type="button" variant="ghost" onClick={() => setReporting(true)}>
                    <Flag aria-hidden="true" />
                    Soruyu şikâyet et
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <h2 className="text-xl">{q.myAnswer ? "Cevabın" : "Cevapla"}</h2>
              {q.permissions.canAnswer ? (
                <AnswerForm question={q} onAnswered={setResult} />
              ) : q.myAnswer ? (
                <>
                  <OptionPicker
                    value={optionToLetter(q.myAnswer.selectedOption) ?? undefined}
                    correct={q.correctOption ? (optionToLetter(q.correctOption) ?? undefined) : undefined}
                    revealed={q.correctOption !== null}
                    disabled
                    label="Verdiğin cevap"
                  />
                  <ResultCard question={q} result={result} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Bu soruyu şu an cevaplayamazsın.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {q.permissions.canSeeDiscussion ? (
            <>
              <SolutionsSection
                questionId={q.id}
                aiSlot={(aiSolution) => (
                  <AiSolutionPanel
                    state={aiState === "available" && !aiSolution ? "none" : aiState}
                    solution={aiSolution?.text ? <MathText text={aiSolution.text} className="max-w-prose text-base" /> : undefined}
                  />
                )}
              />
              <CommentSection questionId={q.id} solutionId={null} label="Soru yorumları" />
            </>
          ) : (
            <EmptyState
              icon={Lock}
              as="h2"
              title="Tartışma kilitli"
              description={
                q.myAnswer
                  ? "Yorumlar ve çözümler ödev kapanınca açılacak."
                  : "Yorumları ve çözümleri görmek için önce soruyu cevapla."
              }
            />
          )}
        </div>
      </div>

      <ReportDialog
        open={reporting}
        onOpenChange={setReporting}
        target="question"
        minLength={settings.data?.sikayetMinKarakter ?? 10}
        submit={(reason, description) => questionMutations.report(api(), q.id, reason, description)}
      />
    </div>
  );
}
