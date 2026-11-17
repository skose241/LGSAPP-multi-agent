"use client";

import { formatRelativeTime, reportReasonLabel } from "@lgs/api";
import { reportsQuery, type ReportItem } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, Flag, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { api } from "@/lib/api/client";
import {
  parseReportFilters,
  REPORT_PAGE_SIZE,
  REPORT_STATUS_OPTIONS,
  REPORT_TARGET_OPTIONS,
  reportActionLabel,
  reportFiltersToSearch,
  reportStatusLabel,
  reportTargetLabel,
  userLabel,
  type ReportFilters,
} from "@/lib/teacher/reports";
import { lastValidPage, pageSlice } from "@/lib/teacher/students";
import { cn } from "@/lib/utils";

function statusTone(status: string): "warning" | "success" | "neutral" {
  if (status === "pending") return "warning";
  if (status === "resolved") return "success";
  return "neutral";
}

function ReportCard({ item }: { item: ReportItem }) {
  return (
    <li data-testid="report-item" data-report-id={item.id}>
      <Link
        href={`/ogretmen/sikayetler/${item.id}`}
        className="flex h-full min-h-touch flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm hover:bg-surface-muted"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{reportTargetLabel(item.targetType)}</Badge>
          <Badge tone="neutral">{reportReasonLabel(item.reason)}</Badge>
          <Badge tone={statusTone(item.status)}>{reportStatusLabel(item.status)}</Badge>
          {item.status === "pending" && item.pendingReportCountForTarget > 1 ? <Badge tone="warning">{item.pendingReportCountForTarget} şikâyet</Badge> : null}
        </span>
        <span className="line-clamp-2 text-base font-semibold">{item.targetSummary || "Önizleme yok"}</span>
        <span className="line-clamp-2 text-sm text-muted-foreground">{item.description}</span>
        <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{userLabel(item.reporter)}</span>
          <span>{item.status === "pending" ? formatRelativeTime(item.createdAt) : reportActionLabel(item.actionTaken)}</span>
        </span>
      </Link>
    </li>
  );
}

export function ReportsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => parseReportFilters(new URLSearchParams(params.toString())), [params]);
  const list = useQuery(
    reportsQuery(api(), {
      status: filters.status === "all" ? undefined : filters.status,
      targetType: filters.targetType === "all" ? undefined : filters.targetType,
      page: filters.page,
      pageSize: REPORT_PAGE_SIZE,
    }),
  );

  function update(next: Partial<ReportFilters>) {
    const merged: ReportFilters = { ...filters, page: 1, ...next };
    const target = `${pathname}${reportFiltersToSearch(merged)}`;
    if (next.page !== undefined && next.page === clampTo) router.replace(target);
    else router.push(target);
  }

  const clampTo = list.data ? lastValidPage(list.data.page, list.data.pageSize, list.data.totalCount, list.data.items.length) : null;

  useEffect(() => {
    if (clampTo !== null) update({ page: clampTo });
  }, [clampTo]);

  const data = list.data;
  const slice = data ? pageSlice(data.page, data.pageSize, data.totalCount, data.items.length) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl">Şikâyetler</h1>
        <p className="text-muted-foreground">Öğrencilerin soru, çözüm ve yorumlar hakkındaki şikâyetlerini incele ve karara bağla.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem] md:items-end">
        <div role="group" aria-label="Durum filtresi" className="flex flex-wrap gap-2">
          {REPORT_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filters.status === option.value}
              onClick={() => update({ status: option.value })}
              className={cn(
                "inline-flex min-h-touch items-center rounded-pill border px-4 text-sm font-semibold transition-colors",
                filters.status === option.value ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <SelectField label="Tür" value={filters.targetType} onChange={(event) => update({ targetType: event.target.value as ReportFilters["targetType"] })}>
          {REPORT_TARGET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>

      {list.isPending ? (
        <div role="status" aria-label="Şikâyetler yükleniyor" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState icon={CloudOff} as="h2" title="Şikâyetler yüklenemedi" description={list.error.message} action={<Button onClick={() => list.refetch()}>Tekrar Dene</Button>} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={filters.status === "pending" ? ShieldCheck : Flag}
          as="h2"
          title={filters.status === "pending" ? "Bekleyen şikâyet yok" : "Şikâyet bulunamadı"}
          description={filters.status === "pending" ? "İncelenmeyi bekleyen bir şikâyet yok." : "Filtreleri değiştirmeyi dene."}
        />
      ) : data ? (
        <>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Şikâyet listesi">
            {data.items.map((item) => (
              <ReportCard key={item.id} item={item} />
            ))}
          </ul>
          {slice ? <Pagination slice={slice} onPageChange={(page) => update({ page })} /> : null}
        </>
      ) : null}
    </div>
  );
}
