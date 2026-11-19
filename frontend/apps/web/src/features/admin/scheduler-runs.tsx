"use client";

import { formatDateTimeShort } from "@lgs/api";
import { schedulerRunsQuery, type SchedulerRun } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, History } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { api } from "@/lib/api/client";
import {
  kindLabel,
  parseRunFilters,
  RUN_STATUS_OPTIONS,
  runCounts,
  runFiltersToQuery,
  runFiltersToSearch,
  runStatusLabel,
  runStatusTone,
  SCHEDULER_KINDS,
  triggerLabel,
  type RunFilters,
} from "@/lib/admin/scheduler";
import { lastValidPage, pageSlice } from "@/lib/teacher/students";

export function RunStatusBadge({ status }: { status: string }) {
  return <Badge tone={runStatusTone(status)}>{runStatusLabel(status)}</Badge>;
}

function RunRow({ run }: { run: SchedulerRun }) {
  return (
    <li data-testid="run-item" data-run-id={run.id}>
      <Link
        href={`/yonetim/zamanlayici/${run.id}`}
        className="flex min-h-touch flex-col gap-1.5 rounded-lg border border-border bg-surface p-4 shadow-sm hover:bg-surface-muted"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-base font-semibold">{kindLabel(run.kind)}</span>
          <RunStatusBadge status={run.status} />
          <Badge tone="neutral">{triggerLabel(run.trigger)}</Badge>
        </span>
        <span className="text-sm text-muted-foreground">
          {formatDateTimeShort(run.startedAt)}
          {run.triggeredBy ? ` · ${run.triggeredBy.userName}` : ""}
        </span>
        <span className="text-sm">{runCounts(run)}</span>
        {run.summary ? <span className="line-clamp-2 break-words text-sm text-muted-foreground">{run.summary}</span> : null}
      </Link>
    </li>
  );
}

export function SchedulerRuns() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => parseRunFilters(new URLSearchParams(params.toString())), [params]);
  const list = useQuery(schedulerRunsQuery(api(), runFiltersToQuery(filters)));

  function update(next: Partial<RunFilters>, replace = false) {
    const merged: RunFilters = { ...filters, page: 1, ...next };
    const target = `${pathname}${runFiltersToSearch(merged)}`;
    if (replace) router.replace(target, { scroll: false });
    else router.push(target, { scroll: false });
  }

  const data = list.data;
  const clampTo = data ? lastValidPage(data.page, data.pageSize, data.totalCount, data.items.length) : null;

  useEffect(() => {
    if (clampTo !== null) update({ page: clampTo }, true);
  }, [clampTo]);

  const slice = data ? pageSlice(data.page, data.pageSize, data.totalCount, data.items.length) : null;
  const filtered = filters.kind !== "all" || filters.status !== "all" || filters.from !== "" || filters.to !== "";

  return (
    <Card data-testid="runs-card">
      <CardHeader>
        <CardTitle as="h2">Çalıştırma geçmişi</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Geçmiş filtreleri">
          <SelectField label="Görev" value={filters.kind} onChange={(event) => update({ kind: event.target.value as RunFilters["kind"] })}>
            <option value="all">Tüm görevler</option>
            {SCHEDULER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kindLabel(kind)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Durum" value={filters.status} onChange={(event) => update({ status: event.target.value })}>
            {RUN_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <TextField label="Başlangıç tarihi" type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => update({ from: event.target.value })} />
          <TextField label="Bitiş tarihi" type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => update({ to: event.target.value })} />
        </div>
        {filtered ? (
          <Button type="button" variant="ghost" className="self-start" onClick={() => update({ kind: "all", status: "all", from: "", to: "" })}>
            Filtreleri temizle
          </Button>
        ) : null}

        {list.isPending ? (
          <div role="status" aria-label="Geçmiş yükleniyor" className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-lg bg-surface-muted" />
            ))}
          </div>
        ) : list.isError ? (
          <EmptyState icon={CloudOff} as="h3" title="Geçmiş yüklenemedi" description={list.error.message} action={<Button onClick={() => list.refetch()}>Tekrar Dene</Button>} />
        ) : data && data.items.length === 0 ? (
          <EmptyState icon={History} as="h3" title="Çalıştırma yok" description={filtered ? "Filtreleri değiştirmeyi dene." : "Henüz kayıtlı bir çalıştırma yok."} />
        ) : data ? (
          <>
            <ul className="grid gap-3 lg:grid-cols-2" aria-label="Çalıştırma listesi">
              {data.items.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </ul>
            {slice ? <Pagination slice={slice} onPageChange={(page) => update({ page })} /> : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
