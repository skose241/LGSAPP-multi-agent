"use client";

import { formatDateTimeShort, isApiError, optionToLetter } from "@lgs/api";
import {
  aiKeys,
  aiMutations,
  questionKeys,
  questionQuery,
  solutionKeys,
  solutionsQuery,
  type AnswerKeyChange,
  type DismissDispute,
} from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, CheckCircle2, CloudOff, ShieldCheck, ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { MathText } from "@/components/math-text";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OptionPicker } from "@/components/ui/option-picker";
import { toProblemState } from "@/features/student/comment-node";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const NOTE_MAX = 500;
const LETTERS = ["A", "B", "C", "D"] as const;

type Outcome = { kind: "changed"; data: AnswerKeyChange; letter: string } | { kind: "dismissed"; data: DismissDispute };

function NoteField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        Not (isteğe bağlı)
      </label>
      <textarea
        id={id}
        value={value}
        maxLength={NOTE_MAX}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-base hover:border-neutral-600 focus-visible:border-primary"
      />
      <p className="text-xs text-muted-foreground">
        {value.length} / {NOTE_MAX} karakter
      </p>
    </div>
  );
}

export function DisputeReviewPage({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const question = useQuery(questionQuery(api(), id));
  const solutions = useQuery(solutionsQuery(api(), id));
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [dialog, setDialog] = useState<"change" | "dismiss" | null>(null);
  const [error, setError] = useState<ProblemState | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: questionKeys.detail(id) }),
      queryClient.invalidateQueries({ queryKey: solutionKeys.list(id) }),
      queryClient.invalidateQueries({ queryKey: aiKeys.disputedAll }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };

  const onFailure = async (e: unknown) => {
    setError(toProblemState(e));
    setDialog(null);
    if (isApiError(e) && (e.status === 409 || e.status === 404)) await refresh();
  };

  const q = question.data;
  const rowVersion = q?.rowVersion ?? "";
  const trimmedNote = note.trim() === "" ? null : note.trim();

  const change = useMutation({
    mutationFn: (option: number) => aiMutations.changeCorrectOption(api(), id, option, rowVersion, trimmedNote),
    onSuccess: async (data, option) => {
      setError(null);
      setDialog(null);
      setNote("");
      setOutcome({ kind: "changed", data, letter: optionToLetter(option) ?? "" });
      toast.success("Cevap anahtarı güncellendi.");
      await refresh();
    },
    onError: onFailure,
  });

  const dismiss = useMutation({
    mutationFn: () => aiMutations.dismissDispute(api(), id, rowVersion, trimmedNote),
    onSuccess: async (data) => {
      setError(null);
      setDialog(null);
      setNote("");
      setOutcome({ kind: "dismissed", data });
      toast.success("Şüphe kaldırıldı.");
      await refresh();
    },
    onError: onFailure,
  });

  if (question.isPending) {
    return <div role="status" aria-label="Soru yükleniyor" className="h-96 animate-pulse rounded-lg bg-surface-muted" />;
  }

  if (question.isError || !q) {
    const missing = isApiError(question.error) && (question.error.status === 404 || question.error.status === 403);
    return (
      <EmptyState
        icon={CloudOff}
        as="h2"
        title={missing ? "Soru bulunamadı" : "Soru yüklenemedi"}
        description={missing ? "Bu soruya erişemiyorsun ya da soru kaldırılmış." : (question.error?.message ?? "")}
        action={
          <Button asChild variant="secondary">
            <Link href="/ogretmen/supheli-anahtarlar">Listeye dön</Link>
          </Button>
        }
      />
    );
  }

  const disputed = q.isAnswerDisputed === true;
  const canResolve = q.permissions.canResolveDispute;
  const currentLetter = q.correctOption ? optionToLetter(q.correctOption) : null;
  const aiOption = disputed && canResolve && q.aiSuggestedOption ? q.aiSuggestedOption : null;
  const aiLetter = aiOption ? optionToLetter(aiOption) : null;
  const selected = picked ?? aiOption ?? null;
  const selectedLetter = selected ? optionToLetter(selected) : null;
  const sameAsCurrent = selected !== null && selected === q.correctOption;
  const hiddenAi = (solutions.data?.items ?? []).find((item) => item.type === "ai");
  const answerCount = q.stats?.answerCount ?? 0;
  const options = [q.options.a, q.options.b, q.options.c, q.options.d];

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/ogretmen/supheli-anahtarlar"
        className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Şüpheli anahtarlar
      </Link>

      <div>
        <h1 className="text-3xl">Cevap anahtarı incelemesi</h1>
        <p className="text-muted-foreground">
          {q.lesson.name}
          {q.topic ? ` · ${q.topic.name}` : ""} · {q.stats?.answerCount ?? 0} cevap
        </p>
      </div>

      <ProblemBanner state={error} />

      {outcome ? (
        <div role="status" data-testid="review-outcome" className="flex items-start gap-3 rounded-md border border-correct bg-correct-soft p-4 text-correct-soft-foreground">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
          <div className="text-sm">
            {outcome.kind === "changed" ? (
              <>
                <p className="font-display text-lg font-bold">Cevap anahtarı {outcome.letter} şıkkına çevrildi.</p>
                <p>
                  Etkilenen cevap: {outcome.data.affectedAnswerCount} · Doğru olan: {outcome.data.becameCorrect} · Yanlış olan: {outcome.data.becameIncorrect}
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-lg font-bold">Şüphe kaldırıldı.</p>
                <p>{outcome.data.aiSolutionDeleted ? "Gizli yapay zekâ çözümü silindi." : "Silinecek gizli yapay zekâ çözümü yoktu."}</p>
              </>
            )}
          </div>
        </div>
      ) : null}

      {!disputed && !outcome ? (
        <div role="status" data-testid="review-closed" className="flex items-start gap-3 rounded-md border border-info bg-info-soft p-4 text-info-soft-foreground">
          <ShieldCheck className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
          <p className="text-sm font-semibold">Bu sorunun cevap anahtarı artık şüpheli değil.</p>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardContent className="flex flex-col gap-4">
            {q.image ? <QuestionImage image={q.image} alt={`${q.lesson.name} sorusu`} variant="full" zoomable priority onExpired={() => void refresh()} /> : null}
            {q.text ? <MathText text={q.text} className="max-w-prose text-lg" /> : null}
            <ol className="flex max-w-prose flex-col gap-2" aria-label="Şıklar">
              {LETTERS.map((letter, index) => {
                const optionNumber = index + 1;
                const isKey = optionNumber === q.correctOption;
                const isAi = optionNumber === aiOption;
                const text = options[index];
                if (!text && !isKey && !isAi) return null;
                return (
                  <li
                    key={letter}
                    data-testid={`option-${letter}`}
                    className={cn(
                      "flex flex-wrap items-start gap-2 rounded-md border px-3 py-2",
                      isKey ? "border-correct bg-correct-soft" : isAi ? "border-info bg-info-soft" : "border-border bg-surface",
                    )}
                  >
                    <span className="font-display font-bold">{letter})</span>
                    {text ? <MathText text={text} className="min-w-0 flex-1" /> : <span className="flex-1 text-sm text-muted-foreground">Şık görselde</span>}
                    {isKey ? <Badge tone="success">Mevcut anahtar</Badge> : null}
                    {isAi ? (
                      <Badge tone="info">
                        <Bot aria-hidden="true" />
                        Yapay zekâ önerisi
                      </Badge>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {q.answerKeyReviewedAt ? (
              <p className="text-sm text-muted-foreground" data-testid="review-info">
                Bu soru {formatDateTimeShort(q.answerKeyReviewedAt)} tarihinde {q.answerKeyReviewedBy?.fullName || q.answerKeyReviewedBy?.userName || "bir yetkili"} tarafından incelendi.
                {q.answerKeyReviewNote ? ` Not: ${q.answerKeyReviewNote}` : ""} Sonraki yapay zekâ çözümleri onaylı anahtarla üretilir.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {disputed && !canResolve ? (
            <div role="status" data-testid="not-my-branch" className="flex items-start gap-3 rounded-md border border-border-strong bg-surface-muted p-4 text-sm font-semibold">
              <ShieldQuestion className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
              <p>Bu soru senin branşında değil, karar branş öğretmenine ait.</p>
            </div>
          ) : null}

          {disputed && canResolve ? (
            <Card>
              <CardContent className="flex flex-col gap-4">
                <h2 className="flex items-center gap-2 text-xl">
                  <ShieldQuestion className="size-6 text-warning-soft-foreground" aria-hidden="true" />
                  Karar
                </h2>
                <p className="text-sm">
                  Mevcut anahtar <strong>{currentLetter ?? "-"}</strong>, yapay zekâ <strong>{aiLetter ?? "-"}</strong> şıkkını doğru buldu.
                </p>
                <OptionPicker
                  label="Doğru şık"
                  value={selectedLetter ?? undefined}
                  onValueChange={(letter) => setPicked(LETTERS.indexOf(letter as (typeof LETTERS)[number]) + 1)}
                />
                <NoteField value={note} onChange={setNote} />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" disabled={selected === null || sameAsCurrent} onClick={() => setDialog("change")} data-testid="change-key">
                    {selectedLetter ? `Anahtarı ${selectedLetter} yap` : "Anahtarı değiştir"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setDialog("dismiss")} data-testid="dismiss-dispute">
                    Anahtar doğru, şüpheyi kaldır
                  </Button>
                </div>
                {sameAsCurrent ? <p className="text-xs text-muted-foreground">Seçilen şık zaten doğru cevap olarak işaretli.</p> : null}
              </CardContent>
            </Card>
          ) : null}

          {hiddenAi?.text ? (
            <Card>
              <CardContent className="flex flex-col gap-2" data-testid="hidden-ai-solution">
                <h2 className="flex items-center gap-2 text-xl">
                  <Bot className="size-6 text-info-soft-foreground" aria-hidden="true" />
                  Yapay zekâ çözümü
                </h2>
                <p className="text-xs text-muted-foreground">
                  {hiddenAi.isHidden ? "Bu çözüm şu an öğrencilere gösterilmiyor." : "Bu çözüm öğrencilere görünür."}
                </p>
                <MathText text={hiddenAi.text} className="max-w-prose text-base" />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={dialog === "change"}
        onOpenChange={(open) => setDialog(open ? "change" : null)}
        title={`Cevap anahtarı ${selectedLetter ?? ""} şıkkına çevrilsin mi?`}
        description={`Bu soruyu cevaplayan ${answerCount} öğrencinin sonucu ve puanı yeniden hesaplanır. ${
          selected !== null && selected === aiOption ? "Yapay zekâ çözümü öğrencilere görünür olur." : "Yapay zekâ çözümü silinir."
        }`}
        confirmLabel="Anahtarı değiştir"
        pending={change.isPending}
        onConfirm={() => {
          if (selected !== null) change.mutate(selected);
        }}
      />

      <ConfirmDialog
        open={dialog === "dismiss"}
        onOpenChange={(open) => setDialog(open ? "dismiss" : null)}
        title="Şüphe kaldırılsın mı?"
        description={`Mevcut anahtar (${currentLetter ?? "-"}) doğru kabul edilir. Gizli yapay zekâ çözümü silinir ve sonraki çözümler onaylı anahtarla üretilir.`}
        confirmLabel="Şüpheyi kaldır"
        pending={dismiss.isPending}
        onConfirm={() => dismiss.mutate()}
      />
    </div>
  );
}
