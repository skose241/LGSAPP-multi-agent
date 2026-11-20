"use client";

import { formatDateTime, isApiError } from "@lgs/api";
import { schedulerRunQuery, type SchedulerRunLog } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CloudOff, Loader2, SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RunStatusBadge } from "@/features/admin/scheduler-runs";
import { api } from "@/lib/api/client";
import { kindLabel, logStatusLabel, logStatusTone, runCounts, triggerLabel } from "@/lib/admin/scheduler";

function topicText(log: SchedulerRunLog): string {
  return log.topicName ?? "-";
}

function QuestionLink({ id }: { id: number | null }) {
  if (id === null) return <span className="text-muted-foreground">-</span>;
  return (
    <Link href={`/sorular/${id}`} className="inline-flex min-h-touch items-center font-semibold text-primary underline underline-offset-4">
      Soru {id}
    </Link>
  );
}

function Logs({ logs }: { logs: SchedulerRunLog[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">Bu çalıştırma için kayıt yok.</p>;
  }
  return (
    <>
      <div className="hidden md:block" data-testid="log-table">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Ders, Slot ve Deneme Kayıtları</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className="px-2 py-2 font-semibold">Ders</th>
              <th scope="col" className="px-2 py-2 font-semibold">Konu</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Slot</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Deneme</th>
              <th scope="col" className="px-2 py-2 font-semibold">Durum</th>
              <th scope="col" className="px-2 py-2 font-semibold">Hata</th>
              <th scope="col" className="px-2 py-2 font-semibold">Soru</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, index) => (
              <tr key={index} className="border-t border-border align-top" data-testid="log-row">
                <th scope="row" className="px-2 py-2 text-left font-semibold">{log.lessonName}</th>
                <td className="px-2 py-2">{topicText(log)}</td>
                <td className="px-2 py-2 text-right">{log.slot}</td>
                <td className="px-2 py-2 text-right">{log.attemptNo}</td>
                <td className="px-2 py-2">
                  <Badge tone={logStatusTone(log.status)}>{logStatusLabel(log.status)}</Badge>
                </td>
                <td className="max-w-sm break-words px-2 py-2">{log.errorMessage ?? "-"}</td>
                <td className="px-2 py-2">
                  <QuestionLink id={log.questionId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" data-testid="log-cards">
        {logs.map((log, index) => (
          <li key={index} className="flex flex-col gap-1.5 rounded-md border border-border p-3" data-testid="log-card">
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="text-base font-semibold">{log.lessonName}</span>
              <Badge tone={logStatusTone(log.status)}>{logStatusLabel(log.status)}</Badge>
            </p>
            <p className="text-sm text-muted-foreground">
              {topicText(log)} · Slot {log.slot} · Deneme {log.attemptNo}
            </p>
            {log.errorMessage ? <p className="break-words rounded-md bg-danger-soft p-2 text-sm font-medium text-danger-soft-foreground">{log.errorMessage}</p> : null}
            <QuestionLink id={log.questionId} />
          </li>
        ))}
      </ul>
    </>
  );
}

export function RunDetail({ id }: { id: number }) {
  const run = useQuery(schedulerRunQuery(api(), id));
  const code = run.error && isApiError(run.error) ? run.error.status : 0;
  const data = run.data;

  return (
    <div className="flex flex-col gap-5">
      <Button asChild variant="ghost" className="self-start">
        <Link href="/yonetim/zamanlayici">
          <ArrowLeft aria-hidden="true" />
          Zamanlayıcıya Dön
        </Link>
      </Button>
      {run.isPending ? (
        <div role="status" aria-label="Çalıştırma yükleniyor" className="h-48 animate-pulse rounded-lg bg-surface-muted" />
      ) : run.isError ? (
        code === 404 ? (
          <EmptyState icon={SearchX} as="h2" title="Çalıştırma Bulunamadı" description="Bu numaraya ait bir çalıştırma yok." />
        ) : (
          <EmptyState icon={CloudOff} as="h2" title="Çalıştırma Alınamadı" description={run.error.message} action={<Button onClick={() => run.refetch()}>Tekrar Dene</Button>} />
        )
      ) : data ? (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl">{kindLabel(data.kind)}</h1>
            <p className="flex flex-wrap items-center gap-2" data-testid="run-status">
              <RunStatusBadge status={data.status} />
              <Badge tone="neutral">{triggerLabel(data.trigger)}</Badge>
              {data.status === "running" ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Çalışıyor, sayfa kendiliğinden güncellenir.
                </span>
              ) : null}
            </p>
          </div>
          <Card data-testid="run-summary">
            <CardHeader>
              <CardTitle as="h2">Özet</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Başlangıç</dt>
                  <dd className="text-base font-semibold">{formatDateTime(data.startedAt)}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Bitiş</dt>
                  <dd className="text-base font-semibold">{data.finishedAt ? formatDateTime(data.finishedAt) : "Sürüyor"}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Sonuç</dt>
                  <dd className="text-base font-semibold">{runCounts(data)}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Başlatan</dt>
                  <dd className="break-words text-base font-semibold">{data.triggeredBy?.userName ?? "Zamanlayıcı"}</dd>
                </div>
              </dl>
              {data.summary ? (
                <p
                  data-testid="run-summary-text"
                  className={
                    data.status === "failed" || data.status === "partiallySucceeded" || data.status === "interrupted"
                      ? "break-words rounded-md border border-danger bg-danger-soft p-3 text-sm font-semibold text-danger-soft-foreground"
                      : "break-words text-sm"
                  }
                >
                  {data.summary}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card data-testid="run-logs">
            <CardHeader>
              <CardTitle as="h2">Ders, Slot ve Deneme Kayıtları</CardTitle>
            </CardHeader>
            <CardContent>
              <Logs logs={data.logs} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
