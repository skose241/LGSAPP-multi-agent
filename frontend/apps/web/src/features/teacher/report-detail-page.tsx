"use client";

import { formatDateTimeShort, isApiError, letterToOption, optionToLetter, reportReasonLabel } from "@lgs/api";
import { aiKeys, questionKeys, reportDetailQuery, solutionKeys, teacherKeys, teacherMutations, type ReportDetail, type ReportItem, type ReportResolveActionValue, type ReportResolveResult } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, CloudOff, Flag, ShieldQuestion } from "lucide-react";
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
import { useMe } from "@/features/auth/use-me";
import { toProblemState } from "@/features/student/comment-node";
import { api } from "@/lib/api/client";
import { REPORT_NOTE_MAX, reportActionLabel, reportStatusLabel, reportTargetLabel, resolveChoices, userLabel, type ResolveChoice } from "@/lib/teacher/reports";
import { cn } from "@/lib/utils";

const LETTERS = ["A", "B", "C", "D"] as const;

function ReportSummary({ report }: { report: ReportItem }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{reportTargetLabel(report.targetType)}</Badge>
          <Badge tone="neutral">{reportReasonLabel(report.reason)}</Badge>
          <Badge tone={report.status === "pending" ? "warning" : report.status === "resolved" ? "success" : "neutral"}>{reportStatusLabel(report.status)}</Badge>
        </div>
        <p className="whitespace-pre-wrap break-words text-base" data-testid="report-description">
          {report.description}
        </p>
        <p className="text-sm text-muted-foreground">
          {userLabel(report.reporter)} · {formatDateTimeShort(report.createdAt)}
          {report.reported ? ` · Şikâyet edilen: ${userLabel(report.reported)}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function QuestionTarget({ detail, onImageExpired }: { detail: ReportDetail; onImageExpired: () => void }) {
  const question = detail.question;
  if (!question) return null;
  const options = [question.optionA, question.optionB, question.optionC, question.optionD];
  const counts = new Map(question.answerDistribution.map((entry) => [entry.option, entry.count]));

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <h2 className="text-xl">Şikâyet edilen soru</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {question.isHidden ? <Badge tone="warning">Gizli</Badge> : null}
          {question.isAnswerDisputed ? <Badge tone="warning">Şüpheli anahtar</Badge> : null}
          <span className="text-sm text-muted-foreground">{question.answerCount} cevap</span>
        </div>
        {question.image ? <QuestionImage image={question.image} alt="Şikâyet edilen soru görseli" variant="full" zoomable onExpired={onImageExpired} /> : null}
        {question.text ? <MathText text={question.text} className="max-w-prose text-lg" /> : null}
        <ol className="flex max-w-prose flex-col gap-2" aria-label="Şıklar">
          {LETTERS.map((letter, index) => {
            const number = index + 1;
            const isKey = number === question.correctOption;
            const text = options[index];
            return (
              <li key={letter} className={cn("flex flex-wrap items-start gap-2 rounded-md border px-3 py-2", isKey ? "border-correct bg-correct-soft" : "border-border bg-surface")}>
                <span className="font-display font-bold">{letter})</span>
                {text ? <MathText text={text} className="min-w-0 flex-1" /> : <span className="flex-1 text-sm text-muted-foreground">Şık görselde</span>}
                <span className="text-xs text-muted-foreground">{counts.get(number) ?? 0} cevap</span>
                {isKey ? <Badge tone="success">Kayıtlı cevap</Badge> : null}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href={`/sorular/${detail.report.questionId}`}>Soruyu aç</Link>
          </Button>
          {detail.report.reason === "wrongAnswerKey" ? (
            <Button asChild variant="secondary">
              <Link href={`/ogretmen/supheli-anahtarlar/${detail.report.questionId}`} data-testid="dispute-link">
                <ShieldQuestion aria-hidden="true" />
                Şüpheli anahtar incelemesi
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function OtherTargets({ detail, onImageExpired }: { detail: ReportDetail; onImageExpired: () => void }) {
  const { comment, solution } = detail;
  if (comment) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-xl">Şikâyet edilen yorum</h2>
          <p className="text-sm text-muted-foreground">
            {userLabel(comment.author)} · {formatDateTimeShort(comment.createdAt)}
          </p>
          <p className="max-w-prose whitespace-pre-wrap break-words text-base">{comment.body}</p>
          <Button asChild variant="secondary" className="self-start">
            <Link href={`/sorular/${detail.report.questionId}`}>Soruyu aç</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (solution) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-xl">Şikâyet edilen çözüm</h2>
          <p className="text-sm text-muted-foreground">
            {userLabel(solution.author)} · {formatDateTimeShort(solution.createdAt)}
            {solution.isHidden ? " · Gizli" : ""}
            {solution.isDeleted ? " · Silinmiş" : ""}
          </p>
          {solution.text ? <MathText text={solution.text} className="max-w-prose text-base" /> : null}
          {solution.image ? <QuestionImage image={solution.image} alt="Çözüm görseli" variant="full" zoomable onExpired={onImageExpired} /> : null}
          <Button asChild variant="secondary" className="self-start">
            <Link href={`/sorular/${detail.report.questionId}`}>Soruyu aç</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return null;
}

function ResolveForm({ detail, onResolved, onFailure }: { detail: ReportDetail; onResolved: (result: ReportResolveResult) => void; onFailure: (state: ProblemState | null) => void }) {
  const queryClient = useQueryClient();
  const me = useMe();
  const groupId = useId();
  const report = detail.report;
  const choices = resolveChoices({ targetType: report.targetType, isMudur: me.data?.role === "mudur" });
  const [action, setAction] = useState<ReportResolveActionValue | null>(null);
  const [letter, setLetter] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const choice: ResolveChoice | undefined = choices.find((entry) => entry.value === action);
  const correctOption = letter ? (letterToOption(letter) ?? null) : null;
  const ready = action !== null && (action !== "changeAnswerKey" || correctOption !== null);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: teacherKeys.reportsAll }),
      queryClient.invalidateQueries({ queryKey: teacherKeys.needsAll }),
      queryClient.invalidateQueries({ queryKey: aiKeys.disputedAll }),
      queryClient.invalidateQueries({ queryKey: questionKeys.all }),
      queryClient.invalidateQueries({ queryKey: solutionKeys.list(report.questionId) }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };

  const mutation = useMutation({
    mutationFn: () =>
      teacherMutations.resolveReport(api(), report.id, {
        action: action ?? "reject",
        note: note.trim() === "" ? null : note.trim(),
        correctOption: action === "changeAnswerKey" ? correctOption : null,
        rowVersion: report.rowVersion,
      }),
    onSuccess: async (result) => {
      onFailure(null);
      setConfirming(false);
      toast.success("Karar kaydedildi.");
      onResolved(result);
      await refresh();
    },
    onError: async (e: unknown) => {
      onFailure(toProblemState(e));
      setConfirming(false);
      if (isApiError(e) && (e.status === 409 || e.status === 404)) await refresh();
    },
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-xl">
          <Flag className="size-6 text-warning-soft-foreground" aria-hidden="true" />
          Karar
        </h2>
        {report.pendingReportCountForTarget > 1 ? (
          <p className="text-sm text-muted-foreground" data-testid="group-note">
            Aynı içerik için bekleyen {report.pendingReportCountForTarget} şikâyet var. Karar hepsine uygulanır.
          </p>
        ) : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Ne yapılsın?</legend>
          {choices.map((entry) => (
            <label
              key={entry.value}
              className={cn(
                "flex min-h-touch cursor-pointer items-start gap-3 rounded-md border px-3 py-2",
                action === entry.value ? "border-primary bg-primary-soft" : "border-border-strong bg-surface hover:bg-surface-muted",
              )}
            >
              <input type="radio" name={groupId} value={entry.value} checked={action === entry.value} onChange={() => setAction(entry.value)} className="mt-1.5 size-5 accent-primary" />
              <span className="flex flex-col">
                <span className="text-base font-semibold">{entry.label}</span>
                <span className="text-sm text-muted-foreground">{entry.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {action === "changeAnswerKey" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Yeni doğru şık</p>
            <OptionPicker label="Yeni doğru şık" value={letter} onValueChange={setLetter} />
            {detail.question ? <p className="text-xs text-muted-foreground">Kayıtlı cevap: {optionToLetter(detail.question.correctOption) ?? "-"}</p> : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${groupId}-note`} className="text-sm font-semibold">
            Not (isteğe bağlı)
          </label>
          <textarea
            id={`${groupId}-note`}
            value={note}
            maxLength={REPORT_NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-24 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-base hover:border-neutral-600 focus-visible:border-primary"
          />
          <p className="text-xs text-muted-foreground">
            {note.length} / {REPORT_NOTE_MAX} karakter
          </p>
        </div>

        <Button type="button" className="self-start" disabled={!ready} onClick={() => setConfirming(true)} data-testid="resolve-submit">
          Kararı uygula
        </Button>
      </CardContent>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={choice ? `${choice.label}?` : "Karar uygulansın mı?"}
        description={choice ? `${choice.description} Aynı içerik için bekleyen tüm şikâyetler kapanır.` : ""}
        confirmLabel="Uygula"
        tone={choice?.tone ?? "primary"}
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </Card>
  );
}

function ResolvedPanel({ report, outcome }: { report: ReportItem; outcome: ReportResolveResult | null }) {
  const byOther = outcome === null;
  return (
    <div role="status" data-testid="report-outcome" className="flex items-start gap-3 rounded-md border border-correct bg-correct-soft p-4 text-correct-soft-foreground">
      <CheckCircle2 className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
      <div className="text-sm">
        <p className="font-display text-lg font-bold">
          {reportStatusLabel(outcome?.status ?? report.status)}: {reportActionLabel(outcome?.actionTaken ?? report.actionTaken)}
        </p>
        {byOther ? (
          <p className="font-semibold" data-testid="resolved-by-other">
            Bu şikâyet {userLabel(report.resolvedBy)} tarafından {report.resolvedAt ? formatDateTimeShort(report.resolvedAt) : "daha önce"} karara bağlanmış.
          </p>
        ) : null}
        {outcome ? <p>Kapanan şikâyet sayısı: {outcome.closedReportCount}</p> : null}
        {outcome?.answerKeyChange ? (
          <p>
            Etkilenen cevap: {outcome.answerKeyChange.affectedAnswerCount} · Doğru olan: {outcome.answerKeyChange.becameCorrect} · Yanlış olan: {outcome.answerKeyChange.becameIncorrect}
          </p>
        ) : null}
        {report.resolvedAt ? (
          <p>
            {formatDateTimeShort(report.resolvedAt)} · {userLabel(report.resolvedBy)}
          </p>
        ) : null}
        {report.resolutionNote ? <p>Not: {report.resolutionNote}</p> : null}
      </div>
    </div>
  );
}

export function ReportDetailPage({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const detail = useQuery(reportDetailQuery(api(), id));
  const [outcome, setOutcome] = useState<ReportResolveResult | null>(null);
  const [resolveError, setResolveError] = useState<ProblemState | null>(null);

  const back = (
    <Link href="/ogretmen/sikayetler" className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Şikâyetler
    </Link>
  );

  if (detail.isPending) {
    return <div role="status" aria-label="Şikâyet yükleniyor" className="h-96 animate-pulse rounded-lg bg-surface-muted" />;
  }

  if (detail.isError) {
    const missing = isApiError(detail.error) && detail.error.status === 404;
    return (
      <div className="flex flex-col gap-5">
        {back}
        <EmptyState
          icon={CloudOff}
          as="h2"
          title={missing ? "Şikâyet bulunamadı" : "Şikâyet yüklenemedi"}
          description={missing ? "Bu şikâyet kaldırılmış olabilir." : detail.error.message}
          action={
            missing ? (
              <Button asChild variant="secondary">
                <Link href="/ogretmen/sikayetler">Listeye dön</Link>
              </Button>
            ) : (
              <Button onClick={() => detail.refetch()}>Tekrar Dene</Button>
            )
          }
        />
      </div>
    );
  }

  const data = detail.data;
  const report = data.report;
  const refreshDetail = () => queryClient.invalidateQueries({ queryKey: teacherKeys.report(id) });

  return (
    <div className="flex flex-col gap-5">
      {back}
      <div>
        <h1 className="text-3xl">Şikâyet incelemesi</h1>
        <p className="text-muted-foreground">
          {reportTargetLabel(report.targetType)} şikâyeti · {reportReasonLabel(report.reason)}
        </p>
      </div>

      <ProblemBanner state={resolveError} />
      {resolveError?.status === 403 ? (
        <p className="text-sm font-semibold" data-testid="forbidden-hint">
          Bu işlem için yetkin yok. Cevap anahtarı kararları branş öğretmenine aittir.
        </p>
      ) : null}

      {report.status !== "pending" || outcome ? <ResolvedPanel report={report} outcome={outcome} /> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <ReportSummary report={report} />
          <QuestionTarget detail={data} onImageExpired={() => void refreshDetail()} />
          <OtherTargets detail={data} onImageExpired={() => void refreshDetail()} />
        </div>
        <div className="flex flex-col gap-4">
          {report.status === "pending" && !outcome ? <ResolveForm detail={data} onResolved={setOutcome} onFailure={setResolveError} /> : null}
          {data.otherReports.length > 0 ? (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <h2 className="text-xl">Aynı içerikle ilgili diğer şikâyetler</h2>
                <ul className="flex flex-col gap-2" aria-label="Diğer şikâyetler">
                  {data.otherReports.map((other) => (
                    <li key={other.id} className="rounded-md border border-border p-3 text-sm" data-testid="other-report">
                      <p className="font-semibold">
                        {reportReasonLabel(other.reason)} · {reportStatusLabel(other.status)}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{other.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {userLabel(other.reporter)} · {formatDateTimeShort(other.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
