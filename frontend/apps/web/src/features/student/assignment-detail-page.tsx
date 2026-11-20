"use client";

import { formatDateOnly, isApiError, todayInIstanbul } from "@lgs/api";
import { studentAssignmentQuery, assignmentKeys, type StudentAssignmentQuestion } from "@lgs/api/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, CircleDashed, CloudOff, ImageIcon, Lock, MinusCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { MathText } from "@/components/math-text";
import { ProgressBar } from "@/components/progress-bar";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { assignmentQuestionHref, nextUnanswered, questionProgress, type QuestionProgress } from "@/lib/student/assignments";
import { remainingLabel } from "@/lib/teacher/assignments";

const PROGRESS_LABEL: Record<QuestionProgress, string> = {
  correct: "Doğru",
  wrong: "Yanlış",
  answered: "Cevaplandı",
  pending: "Çözülmedi",
  locked: "Cevaplanmadı",
};

function ProgressBadge({ progress }: { progress: QuestionProgress }) {
  if (progress === "correct") {
    return (
      <Badge tone="success">
        <CheckCircle2 aria-hidden="true" />
        {PROGRESS_LABEL[progress]}
      </Badge>
    );
  }
  if (progress === "wrong") {
    return (
      <Badge tone="danger">
        <XCircle aria-hidden="true" />
        {PROGRESS_LABEL[progress]}
      </Badge>
    );
  }
  if (progress === "locked") {
    return (
      <Badge tone="neutral">
        <MinusCircle aria-hidden="true" />
        {PROGRESS_LABEL[progress]}
      </Badge>
    );
  }
  return (
    <Badge tone="warning">
      <CircleDashed aria-hidden="true" />
      {PROGRESS_LABEL[progress]}
    </Badge>
  );
}

function QuestionRow({ question, assignmentId, onImageExpired }: { question: StudentAssignmentQuestion; assignmentId: number; onImageExpired: () => void }) {
  const progress = questionProgress(question);
  const href = assignmentQuestionHref(question.id, assignmentId);
  const actionLabel = progress === "pending" ? "Çöz" : progress === "locked" ? "Soruyu Gör" : "Soruya Git";
  return (
    <li data-testid="assignment-question" data-question-id={question.id} data-progress={progress}>
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-bold">Soru {question.orderNo}</span>
              <ProgressBadge progress={progress} />
            </div>
            {question.image ? (
              <div className="max-w-xs">
                <QuestionImage image={question.image} alt={`Soru ${question.orderNo} görseli`} variant="thumb" onExpired={onImageExpired} />
              </div>
            ) : null}
            {question.text ? (
              <MathText text={question.text} compact className="line-clamp-3 max-w-prose overflow-hidden text-base" />
            ) : question.image ? null : (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <ImageIcon className="size-4" aria-hidden="true" />
                Önizleme Yok
              </span>
            )}
          </div>
          <Button asChild variant={progress === "pending" ? "primary" : "secondary"} className="sm:self-center">
            <Link href={href} aria-label={`${actionLabel}: Soru ${question.orderNo}`}>
              {progress === "locked" ? <Lock aria-hidden="true" /> : null}
              {actionLabel}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}

export function StudentAssignmentDetailPage({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const detail = useQuery(studentAssignmentQuery(api(), id));
  const today = todayInIstanbul();
  const refresh = () => queryClient.invalidateQueries({ queryKey: assignmentKeys.studentDetail(id) });

  const back = (
    <Link href="/odevler" className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Ödevlerim
    </Link>
  );

  if (detail.isPending) {
    return <div role="status" aria-label="Ödev yükleniyor" className="h-96 animate-pulse rounded-lg bg-surface-muted" />;
  }

  if (detail.isError) {
    const missing = isApiError(detail.error) && (detail.error.status === 404 || detail.error.status === 403);
    return (
      <div className="flex flex-col gap-4">
        {back}
        <EmptyState
          icon={CloudOff}
          as="h2"
          title={missing ? "Ödev Bulunamadı" : "Ödev Yüklenemedi"}
          description={missing ? "Bu ödeve erişemiyorsunuz ya da henüz yayınlanmadı." : detail.error.message}
          action={missing ? undefined : <Button onClick={() => detail.refetch()}>Tekrar Dene</Button>}
        />
      </div>
    );
  }

  const data = detail.data;
  const closed = data.state === "closed";
  const next = closed ? undefined : nextUnanswered(data.questions);

  return (
    <div className="flex flex-col gap-5">
      {back}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{data.lesson.name}</Badge>
          <Badge tone={closed ? "neutral" : "success"} data-testid="assignment-remaining">
            {remainingLabel(data.state, data.startDate, data.endDate, today)}
          </Badge>
        </div>
        <h1 className="text-3xl" data-testid="assignment-title">
          {data.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.teacherUserName} · {formatDateOnly(data.startDate)} – {formatDateOnly(data.endDate)}
        </p>
        {data.description ? <p className="max-w-prose whitespace-pre-wrap break-words">{data.description}</p> : null}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <ProgressBar label="Ödev ilerlemesi" value={data.myAnsweredCount} max={data.totalQuestions} />
          <p className="text-sm" data-testid="assignment-progress">
            {data.myAnsweredCount} / {data.totalQuestions} soru çözüldü, {data.myCorrectCount} doğru
          </p>
          {next ? (
            <Button asChild className="self-start">
              <Link href={assignmentQuestionHref(next.id, data.id)}>Sıradaki Soruya Geç</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {data.questions.length === 0 ? (
        <EmptyState icon={CircleDashed} as="h2" title="Bu Ödevde Soru Yok" description="Öğretmeniniz soru eklediğinde burada görünecek." />
      ) : (
        <section aria-label="Ödev soruları" className="flex flex-col gap-3">
          <h2 className="text-xl">Sorular ({data.questions.length})</h2>
          <ul className="flex flex-col gap-3">
            {data.questions.map((question) => (
              <QuestionRow key={question.id} question={question} assignmentId={data.id} onImageExpired={() => void refresh()} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
