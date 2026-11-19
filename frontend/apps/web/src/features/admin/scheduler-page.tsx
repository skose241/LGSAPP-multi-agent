"use client";

import { formatDateTimeShort, isApiError, problemRunId } from "@lgs/api";
import {
  schedulerKeys,
  schedulerMutations,
  schedulerStatusQuery,
  type SchedulerJob,
  type SchedulerKind,
  type SchedulerStatus,
  type TodayLesson,
} from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CloudOff, Loader2, Lock, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ProblemBanner, useCountdown, type ProblemState } from "@/components/problem-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RunStatusBadge, SchedulerRuns } from "@/features/admin/scheduler-runs";
import { toProblemState } from "@/features/student/comment-node";
import { api } from "@/lib/api/client";
import { confirmCopy, kindLabel, runCounts, SCHEDULER_KINDS } from "@/lib/admin/scheduler";

const bandTone = "flex items-start gap-3 rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground";

function Band({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div role="status" data-testid={testId} className={bandTone}>
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function StatusBands({ status }: { status: SchedulerStatus }) {
  return (
    <>
      {!status.timerEnabled ? <Band testId="band-timer">Otomatik zamanlayıcı kapalı; görevler yalnız elle çalışır.</Band> : null}
      {!status.aiConfigured ? <Band testId="band-ai">Yapay zekâ anahtarı tanımlı değil; soru üretimi çalışmaz.</Band> : null}
      {!status.generationEnabled ? <Band testId="band-generation">Soru üretimi ayarlardan kapatılmış.</Band> : null}
      {status.fakeGenerator ? <Band testId="band-fake">Sahte üretici etkin; üretilen sorular gerçek yapay zekâdan gelmez.</Band> : null}
    </>
  );
}

function StartError({ state, countdown }: { state: ProblemState | null; countdown: number }) {
  if (!state) return null;
  const runId = state.status === 409 ? problemRunId(state.problem) : null;
  if (runId !== null) {
    return (
      <div
        role="alert"
        data-testid="run-conflict"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground"
      >
        <Loader2 className="size-5 shrink-0" aria-hidden="true" />
        <p>Bu görev şu anda çalışıyor.</p>
        <Link href={`/yonetim/zamanlayici/${runId}`} className="inline-flex min-h-touch items-center font-semibold underline underline-offset-4">
          Çalıştırmayı gör
        </Link>
      </div>
    );
  }
  if (state.status === 401) {
    return (
      <div role="alert" data-testid="run-unauthorized" className="rounded-md border border-danger bg-danger-soft p-3 text-sm font-medium text-danger-soft-foreground">
        Oturumun sona erdi. Yeniden giriş yapıp tekrar dene.
      </div>
    );
  }
  if (state.status === 403) {
    return (
      <div role="alert" data-testid="run-forbidden" className="rounded-md border border-danger bg-danger-soft p-3 text-sm font-medium text-danger-soft-foreground">
        Görevleri çalıştırma yetkin yok.
      </div>
    );
  }
  return <ProblemBanner state={state} countdown={countdown} conflictAsMessage />;
}

function aiKeyInvalid(summary: string | null): boolean {
  return summary !== null && summary.toLocaleLowerCase("tr-TR").includes("anahtar");
}

interface JobCardProps {
  job: SchedulerJob;
  blocked: boolean;
  onRun: (kind: SchedulerKind) => void;
}

function JobCard({ job, blocked, onRun }: JobCardProps) {
  const kind = job.kind as SchedulerKind;
  const last = job.lastRun;
  const failed = last !== null && (last.status === "failed" || last.status === "partiallySucceeded" || last.status === "interrupted");
  const running = job.runningRunId !== null;
  return (
    <li data-testid="job-card" data-kind={job.kind} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg">{kindLabel(job.kind)}</h3>
        {job.due ? <Badge tone="warning">Zamanı geldi</Badge> : <Badge tone="neutral">Bekliyor</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        Planlanan saat: <span className="font-semibold text-foreground">{job.scheduledAt}</span>
      </p>
      {last ? (
        <div className="flex flex-col gap-1.5" data-testid="job-last-run">
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Son çalıştırma:</span>
            <RunStatusBadge status={last.status} />
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDateTimeShort(last.startedAt)} · {runCounts(last)}
          </p>
          {last.summary ? (
            <p
              data-testid="job-last-summary"
              className={failed ? "break-words rounded-md border border-danger bg-danger-soft p-2 text-sm font-semibold text-danger-soft-foreground" : "break-words text-sm"}
            >
              {last.summary}
            </p>
          ) : null}
          {last.status === "failed" && aiKeyInvalid(last.summary) ? (
            <p className="text-sm">
              <Link href="/yonetim/yapay-zeka" className="inline-flex min-h-touch items-center font-semibold underline underline-offset-4">
                Yapay zekâ ayarlarını kontrol et
              </Link>
            </p>
          ) : null}
          <Link href={`/yonetim/zamanlayici/${last.id}`} className="inline-flex min-h-touch items-center text-sm font-semibold text-primary underline underline-offset-4">
            Ayrıntıyı gör
            <span className="sr-only"> : {kindLabel(job.kind)}</span>
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Henüz çalıştırılmadı.</p>
      )}
      {running ? (
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold" data-testid="job-running">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Şu anda çalışıyor.
          <Link href={`/yonetim/zamanlayici/${job.runningRunId}`} className="inline-flex min-h-touch items-center text-primary underline underline-offset-4">
            Çalıştırmayı gör
          </Link>
        </p>
      ) : null}
      <Button type="button" variant="secondary" className="mt-auto self-start" disabled={blocked || running} data-testid="run-now" data-kind={job.kind} onClick={() => onRun(kind)}>
        <Play aria-hidden="true" />
        Şimdi çalıştır
        <span className="sr-only"> : {kindLabel(job.kind)}</span>
      </Button>
    </li>
  );
}

function LessonsTable({ lessons }: { lessons: TodayLesson[] }) {
  if (lessons.length === 0) {
    return <p className="text-sm text-muted-foreground">Bugün için planlı ders yok.</p>;
  }
  return (
    <>
      <div className="hidden md:block" data-testid="lessons-table">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Bugünkü ders programı ve üretim durumu</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className="px-2 py-2 font-semibold">Ders</th>
              <th scope="col" className="px-2 py-2 font-semibold">Konu</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Hedef</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Başarılı</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Hatalı</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Eksik</th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((lesson) => (
              <tr key={lesson.lessonId} className="border-t border-border" data-testid="lesson-row">
                <th scope="row" className="px-2 py-2 text-left font-semibold">{lesson.lessonName}</th>
                <td className="px-2 py-2">{lesson.topic?.name ?? "Konu seçilmemiş"}</td>
                <td className="px-2 py-2 text-right">{lesson.target}</td>
                <td className="px-2 py-2 text-right">{lesson.succeeded}</td>
                <td className="px-2 py-2 text-right">{lesson.failed}</td>
                <td className="px-2 py-2 text-right">{lesson.missingSlots}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" data-testid="lessons-cards">
        {lessons.map((lesson) => (
          <li key={lesson.lessonId} className="rounded-md border border-border p-3">
            <p className="text-base font-semibold">{lesson.lessonName}</p>
            <p className="text-sm text-muted-foreground">{lesson.topic?.name ?? "Konu seçilmemiş"}</p>
            <dl className="mt-2 grid grid-cols-4 gap-2 text-center text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Hedef</dt>
                <dd className="font-semibold">{lesson.target}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Başarılı</dt>
                <dd className="font-semibold">{lesson.succeeded}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Hatalı</dt>
                <dd className="font-semibold">{lesson.failed}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Eksik</dt>
                <dd className="font-semibold">{lesson.missingSlots}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function StatusSection({ status }: { status: SchedulerStatus }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<SchedulerKind | null>(null);
  const [error, setError] = useState<ProblemState | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const countdown = useCountdown(error?.status === 429 ? error.problem.retryAfter : null, error?.at);

  const mutation = useMutation({
    mutationFn: (target: SchedulerKind) => schedulerMutations.startRun(api(), target),
    onSuccess: async (run) => {
      setError(null);
      setKind(null);
      await queryClient.invalidateQueries({ queryKey: schedulerKeys.all });
      router.push(`/yonetim/zamanlayici/${run.id}`);
    },
    onError: (failure: unknown) => {
      setError(toProblemState(failure));
      setKind(null);
      void queryClient.invalidateQueries({ queryKey: schedulerKeys.status() });
    },
  });

  const copy = kind ? confirmCopy(kind) : null;
  const jobs = SCHEDULER_KINDS.map((entry) => status.jobs.find((job) => job.kind === entry)).filter((job): job is SchedulerJob => job !== undefined);

  return (
    <>
      <StatusBands status={status} />
      <StartError state={error} countdown={countdown} />
      <section aria-labelledby="jobs-heading" className="flex flex-col gap-3">
        <h2 id="jobs-heading" className="text-xl">
          Günlük görevler
        </h2>
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Görev listesi">
          {jobs.map((job) => (
            <JobCard
              key={job.kind}
              job={job}
              blocked={mutation.isPending || countdown > 0}
              onRun={(target) => {
                returnFocus.current = document.activeElement as HTMLElement | null;
                setError(null);
                setKind(target);
              }}
            />
          ))}
        </ul>
        {countdown > 0 ? <p className="text-sm text-muted-foreground">Görevler {countdown} saniye sonra tekrar çalıştırılabilir.</p> : null}
      </section>
      <Card data-testid="lessons-card">
        <CardHeader>
          <CardTitle as="h2">Bugünkü ders tablosu</CardTitle>
        </CardHeader>
        <CardContent>
          <LessonsTable lessons={status.todayLessons} />
        </CardContent>
      </Card>
      {copy ? (
        <ConfirmDialog
          open={kind !== null}
          onOpenChange={(open) => {
            if (!open) setKind(null);
          }}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirmLabel}
          pending={mutation.isPending}
          onConfirm={() => kind && mutation.mutate(kind)}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus();
            }
          }}
        />
      ) : null}
    </>
  );
}

export function SchedulerPage() {
  const status = useQuery({
    ...schedulerStatusQuery(api()),
    refetchInterval: (query) => (query.state.data?.jobs.some((job) => job.runningRunId !== null) ? 5_000 : 30_000),
    refetchIntervalInBackground: false,
  });
  const code = status.error && isApiError(status.error) ? status.error.status : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl">Zamanlayıcı</h1>
        <p className="text-muted-foreground">Günlük görevlerin durumunu izle, gerekirse elle çalıştır.</p>
      </div>
      {status.isPending ? (
        <div role="status" aria-label="Zamanlayıcı yükleniyor" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : status.isError ? (
        <EmptyState
          icon={code === 401 || code === 403 ? Lock : CloudOff}
          as="h2"
          title={code === 403 ? "Bu sayfaya erişimin yok" : code === 401 ? "Oturumun sona erdi" : "Zamanlayıcı durumu alınamadı"}
          description={status.error.message}
          action={<Button onClick={() => status.refetch()}>Tekrar Dene</Button>}
        />
      ) : (
        <StatusSection status={status.data} />
      )}
      <Suspense>
        <SchedulerRuns />
      </Suspense>
    </div>
  );
}
