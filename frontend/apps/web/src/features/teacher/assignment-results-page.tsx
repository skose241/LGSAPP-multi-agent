"use client";

import { formatRelativeTime, isApiError } from "@lgs/api";
import { assignmentResultsQuery, type AssignmentResultQuestion, type AssignmentResultStudent, type AssignmentResults } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, CloudOff } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { ProgressBar } from "@/components/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { api } from "@/lib/api/client";
import {
  RESULT_SORTS,
  parseResultsView,
  participationLabel,
  participationOf,
  participationTone,
  percentOfRate,
  resultsViewToSearch,
  sortDirection,
  stateLabel,
  stateTone,
  type ResultsView,
} from "@/lib/teacher/assignments";
import { lastValidPage, pageSlice } from "@/lib/teacher/students";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 100;
const headerClasses = "px-3 py-3 font-semibold";

function lastAnswer(row: AssignmentResultStudent): string {
  return row.lastAnsweredAt ? formatRelativeTime(row.lastAnsweredAt) : "Henüz cevap yok";
}

function StudentLink({ row }: { row: AssignmentResultStudent }) {
  return (
    <Link href={`/ogretmen/ogrenciler/${row.userId}`} className="inline-flex min-h-touch min-w-0 max-w-full flex-col justify-center text-primary underline underline-offset-4">
      <span className="truncate font-semibold">{row.fullName || row.userName}</span>
      <span className="truncate font-mono text-xs text-muted-foreground">{row.userName}</span>
    </Link>
  );
}

function Distribution({ question }: { question: AssignmentResultQuestion }) {
  const entries = [
    { letter: "A", option: 1, count: question.distribution.a },
    { letter: "B", option: 2, count: question.distribution.b },
    { letter: "C", option: 3, count: question.distribution.c },
    { letter: "D", option: 4, count: question.distribution.d },
  ];
  const total = Math.max(1, question.answerCount);
  return (
    <ul className="flex flex-col gap-1.5" aria-label={`Soru ${question.orderNo} şık dağılımı`}>
      {entries.map((entry) => {
        const correct = entry.option === question.correctOption;
        return (
          <li key={entry.letter} className="flex items-center gap-2 text-sm">
            <span className={cn("w-6 font-display font-bold", correct && "text-correct-soft-foreground")}>{entry.letter}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-pill bg-surface-muted">
              <span className={cn("block h-full rounded-pill", correct ? "bg-success" : "bg-neutral-400")} style={{ width: `${Math.round((entry.count / total) * 100)}%` }} />
            </span>
            <span className="w-16 text-right tabular-nums">
              {entry.count}
              {correct ? " (doğru)" : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function AssignmentResultsPage({ id }: { id: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = useMemo(() => parseResultsView(new URLSearchParams(params.toString())), [params]);
  const results = useQuery(assignmentResultsQuery(api(), { id, sort: view.sort, dir: sortDirection(view.sort), page: view.page, pageSize: PAGE_SIZE }));

  function update(next: Partial<ResultsView>, mode: "push" | "replace" = "push") {
    const merged: ResultsView = { ...view, page: 1, ...next };
    const target = `${pathname}${resultsViewToSearch(merged)}`;
    if (mode === "replace") router.replace(target);
    else router.push(target);
  }

  const data: AssignmentResults | undefined = results.data;
  const clampTo = data ? lastValidPage(data.page, data.pageSize, data.totalStudents, data.students.length) : null;
  useEffect(() => {
    if (clampTo !== null) update({ page: clampTo }, "replace");
  }, [clampTo]);

  const back = (
    <Link href={`/ogretmen/odevler/${id}`} className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Ödev
    </Link>
  );

  if (results.isPending) {
    return <div role="status" aria-label="Sonuçlar yükleniyor" className="h-96 animate-pulse rounded-lg bg-surface-muted" />;
  }

  if (results.isError) {
    const missing = isApiError(results.error) && (results.error.status === 404 || results.error.status === 403);
    return (
      <div className="flex flex-col gap-4">
        {back}
        <EmptyState
          icon={CloudOff}
          as="h2"
          title={missing ? "Ödev bulunamadı" : "Sonuçlar yüklenemedi"}
          description={missing ? "Ödev silinmiş olabilir ya da bu sonuçlara erişimin yok." : results.error.message}
          action={missing ? undefined : <Button onClick={() => results.refetch()}>Tekrar Dene</Button>}
        />
      </div>
    );
  }

  const slice = pageSlice(data!.page, data!.pageSize, data!.totalStudents, data!.students.length);
  const d = data!;
  const counts = { completed: d.completedCount, partial: d.partialCount, missed: d.missedCount, notStarted: d.notStartedCount };

  return (
    <div className="flex flex-col gap-5">
      {back}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={stateTone(d.state)}>{stateLabel(d.state)}</Badge>
        </div>
        <h1 className="text-3xl" data-testid="results-title">
          {d.title}
        </h1>
        <p className="text-muted-foreground">Ödevin öğrenci ve soru bazında sonuçları.</p>
      </div>

      <section aria-label="Katılım özeti" className="flex flex-col gap-3" data-testid="results-summary">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface p-3">
            <dt className="text-xs text-muted-foreground">Soru</dt>
            <dd className="font-display text-2xl font-bold" data-testid="total-questions">
              {d.totalQuestions}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <dt className="text-xs text-muted-foreground">Öğrenci</dt>
            <dd className="font-display text-2xl font-bold" data-testid="total-students">
              {d.totalStudents}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <dt className="text-xs text-muted-foreground">Katılan</dt>
            <dd className="font-display text-2xl font-bold" data-testid="participants">
              {d.participantCount}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <dt className="text-xs text-muted-foreground">Tamamlayan</dt>
            <dd className="font-display text-2xl font-bold" data-testid="completed-count">
              {d.completedCount}
            </dd>
          </div>
        </dl>
        <ul className="flex flex-wrap gap-2" aria-label="Katılım durumları">
          {(["completed", "partial", "missed", "notStarted"] as const).map((key) => (
            <li key={key}>
              <Badge tone={participationTone(key)} data-testid={`summary-${key}`}>
                {participationLabel(key)}: {counts[key]}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Öğrenci sonuçları" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl">Öğrenciler</h2>
          <SelectField label="Sıralama" value={view.sort} onChange={(event) => update({ sort: event.target.value as ResultsView["sort"] })} className="w-full sm:w-64">
            {RESULT_SORTS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </SelectField>
        </div>

        {d.students.length === 0 ? (
          <EmptyState icon={BarChart3} as="h3" title="Öğrenci yok" description="Sisteme kayıtlı öğrenci bulunmuyor." />
        ) : (
          <>
            <Card className="hidden overflow-hidden xl:block">
              <table className="w-full table-fixed text-left text-sm" data-testid="results-table">
                <caption className="sr-only">Öğrenci sonuçları</caption>
                <colgroup>
                  <col className="w-[26%]" />
                  <col className="w-[14%]" />
                  <col className="w-[12%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead className="bg-surface-muted text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className={headerClasses}>
                      Öğrenci
                    </th>
                    <th scope="col" className={headerClasses}>
                      Katılım
                    </th>
                    <th scope="col" className={`${headerClasses} text-right`}>
                      Çözülen
                    </th>
                    <th scope="col" className={`${headerClasses} text-right`}>
                      Doğru
                    </th>
                    <th scope="col" className={`${headerClasses} text-right`}>
                      Yanlış
                    </th>
                    <th scope="col" className={`${headerClasses} text-right`}>
                      Oran
                    </th>
                    <th scope="col" className={headerClasses}>
                      Son cevap
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.students.map((row) => {
                    const status = participationOf(row.answeredCount, row.totalQuestions, d.state);
                    return (
                      <tr key={row.userId} className="border-t border-border" data-testid="result-row" data-user-name={row.userName} data-participation={status}>
                        <td className="px-3 py-1">
                          <StudentLink row={row} />
                        </td>
                        <td className="px-3 py-1">
                          <Badge tone={participationTone(status)}>{participationLabel(status)}</Badge>
                        </td>
                        <td className="px-3 py-1 text-right">
                          {row.answeredCount}/{row.totalQuestions}
                        </td>
                        <td className="px-3 py-1 text-right">{row.correctCount}</td>
                        <td className="px-3 py-1 text-right">{row.answeredCount - row.correctCount}</td>
                        <td className="px-3 py-1 text-right">{percentOfRate(row.completionRate)}</td>
                        <td className="px-3 py-1 text-muted-foreground">{lastAnswer(row)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            <ul className="grid gap-3 md:grid-cols-2 xl:hidden" aria-label="Öğrenci sonuç kartları">
              {d.students.map((row) => {
                const status = participationOf(row.answeredCount, row.totalQuestions, d.state);
                return (
                  <li key={row.userId} className="min-w-0" data-testid="result-card" data-user-name={row.userName} data-participation={status}>
                    <Card>
                      <CardContent className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <StudentLink row={row} />
                          <Badge tone={participationTone(status)}>{participationLabel(status)}</Badge>
                        </div>
                        <ProgressBar label={`${row.fullName || row.userName} ilerlemesi`} value={row.answeredCount} max={row.totalQuestions} tone={status === "completed" ? "success" : "primary"} />
                        <dl className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <dt className="text-xs text-muted-foreground">Çözülen</dt>
                            <dd className="font-display text-lg font-bold">
                              {row.answeredCount}/{row.totalQuestions}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Doğru</dt>
                            <dd className="font-display text-lg font-bold">{row.correctCount}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Yanlış</dt>
                            <dd className="font-display text-lg font-bold">{row.answeredCount - row.correctCount}</dd>
                          </div>
                        </dl>
                        <p className="text-xs text-muted-foreground">Son cevap: {lastAnswer(row)}</p>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
            <Pagination slice={slice} onPageChange={(page) => update({ page })} />
          </>
        )}
      </section>

      <section aria-label="Soru sonuçları" className="flex flex-col gap-3" data-testid="question-results">
        <h2 className="text-xl">Sorular</h2>
        {d.questions.length === 0 ? (
          <EmptyState icon={BarChart3} as="h3" title="Soru yok" description="Bu ödevde sonuç gösterilecek soru bulunmuyor." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {d.questions.map((question) => (
              <li key={question.id} data-testid="question-result" data-question-id={question.id}>
                <Card className="h-full">
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/sorular/${question.id}`} className="inline-flex min-h-touch items-center font-display text-lg font-bold text-primary underline underline-offset-4">
                        Soru {question.orderNo}
                      </Link>
                      <Badge tone={question.answerCount === 0 ? "neutral" : question.correctRate >= 0.5 ? "success" : "danger"} data-testid="correct-rate">
                        {question.answerCount === 0 ? "Cevap yok" : `Doğru oranı ${percentOfRate(question.correctRate)}`}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {question.answerCount} cevap, {question.correctCount} doğru
                    </p>
                    <Distribution question={question} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
