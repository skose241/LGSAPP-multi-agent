"use client";

import {
  AI_USAGE_DEFAULT_DAYS,
  AI_USAGE_MAX_DAYS,
  aiErrorKindLabel,
  aiOperationLabel,
  formatSuccessRate,
  formatTokens,
  formatUsd,
  summarizeDays,
  usageRange,
} from "@lgs/api";
import { aiAdminUsageQuery, type AiUsageTotals } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const RANGES = [
  { days: AI_USAGE_DEFAULT_DAYS, label: "7 Gün" },
  { days: 30, label: "30 Gün" },
  { days: AI_USAGE_MAX_DAYS, label: "92 Gün" },
] as const;

function shortDate(value: string): string {
  return `${value.slice(8, 10)}.${value.slice(5, 7)}`;
}

function Metric({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-col rounded-md bg-surface-muted px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-display text-2xl font-bold" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

function Totals({ totals }: { totals: AiUsageTotals }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="ai-totals">
      <Metric label="Çağrı" value={formatTokens(totals.calls)} testId="total-calls" />
      <Metric label="Başarı Oranı" value={formatSuccessRate(totals.successRate)} testId="total-success" />
      <Metric label="Maliyet" value={formatUsd(totals.costUsd)} testId="total-cost" />
      <Metric label="Hak Düşen Çağrı" value={formatTokens(totals.limitConsumed)} testId="total-limit" />
      <Metric label="Girdi Token" value={formatTokens(totals.inputTokens)} testId="total-input" />
      <Metric label="Çıktı Token" value={formatTokens(totals.outputTokens)} testId="total-output" />
      <Metric label="Düşünme Token" value={formatTokens(totals.thinkingTokens)} testId="total-thinking" />
      <Metric label="Bekleyen" value={formatTokens(totals.pending)} testId="total-pending" />
    </div>
  );
}

function CallsChart({ days }: { days: ReturnType<typeof summarizeDays> }) {
  const peak = Math.max(1, ...days.map((day) => day.calls));
  const width = Math.max(days.length * 22, 120);
  const height = 120;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-semibold">Günlük Çağrı Sayısı</figcaption>
      <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Günlük çağrı grafiği (kaydırılabilir)">
        <svg role="img" aria-label={`Günlük çağrı grafiği, ${days.length} gün, en yüksek ${peak} çağrı`} viewBox={`0 0 ${width} ${height + 18}`} style={{ minWidth: width }} className="h-40 w-full">
          {days.map((day, index) => {
            const x = index * 22 + 3;
            const successHeight = Math.round((day.succeeded / peak) * height);
            const otherHeight = Math.round(((day.calls - day.succeeded) / peak) * height);
            return (
              <g key={day.date}>
                <rect x={x} y={height - successHeight - otherHeight} width={16} height={otherHeight} className="fill-warning" rx={2} />
                <rect x={x} y={height - successHeight} width={16} height={successHeight} className="fill-primary" rx={2} />
                {days.length <= 14 || index % 7 === 0 ? (
                  <text x={x + 8} y={height + 13} textAnchor="middle" className="fill-muted-foreground text-[8px]">
                    {shortDate(day.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary" aria-hidden="true" />
          Başarılı
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-warning" aria-hidden="true" />
          Başarısız / Reddedilen / Bekleyen
        </span>
      </p>
    </figure>
  );
}

export function AiUsageSection() {
  const [days, setDays] = useState<number>(AI_USAGE_DEFAULT_DAYS);
  const range = useMemo(() => usageRange(days), [days]);
  const usage = useQuery(aiAdminUsageQuery(api(), range.from, range.to));
  const summary = useMemo(() => summarizeDays(usage.data?.byDay ?? []), [usage.data]);

  return (
    <Card data-testid="ai-usage">
      <CardHeader>
        <CardTitle as="h2">Kullanım ve Maliyet</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div role="group" aria-label="Tarih aralığı" className="flex flex-wrap gap-2">
          {RANGES.map((entry) => (
            <button
              key={entry.days}
              type="button"
              aria-pressed={days === entry.days}
              onClick={() => setDays(entry.days)}
              className={cn(
                "inline-flex min-h-touch items-center rounded-pill border px-4 text-sm font-semibold transition-colors",
                days === entry.days ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {usage.isPending ? (
          <div role="status" aria-label="Kullanım yükleniyor" className="h-64 animate-pulse rounded-lg bg-surface-muted" />
        ) : usage.isError ? (
          <EmptyState
            icon={CloudOff}
            as="h3"
            title="Kullanım Alınamadı"
            description={usage.error.message}
            action={<Button onClick={() => usage.refetch()}>Tekrar Dene</Button>}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground" data-testid="usage-range">
              {usage.data.from} - {usage.data.to} ({usage.data.days} gün)
            </p>
            <Totals totals={usage.data.totals} />

            {usage.data.totals.errorKinds.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-base">Hata Türleri</h3>
                <ul className="flex flex-wrap gap-2" data-testid="ai-error-kinds">
                  {usage.data.totals.errorKinds.map((entry) => (
                    <li key={entry.kind} className="rounded-pill bg-danger-soft px-3 py-1 text-sm font-semibold text-danger-soft-foreground">
                      {aiErrorKindLabel(entry.kind)}: {entry.count}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {summary.length > 0 ? <CallsChart days={summary} /> : <p className="text-sm text-muted-foreground">Bu aralıkta yapay zekâ çağrısı yok.</p>}

            {usage.data.byDay.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-base">Gün ve Operasyon Dökümü</h3>
                <div className="overflow-x-auto rounded-md border border-border" tabIndex={0} role="group" aria-label="Kullanım tablosu (kaydırılabilir)">
                  <table className="w-full min-w-[40rem] text-left text-sm" data-testid="ai-usage-table">
                    <caption className="sr-only">Gün ve Operasyon Bazında Yapay Zekâ Kullanımı</caption>
                    <thead className="bg-surface-muted text-xs">
                      <tr>
                        <th scope="col" className="px-3 py-2">Gün</th>
                        <th scope="col" className="px-3 py-2">Operasyon</th>
                        <th scope="col" className="px-3 py-2 text-right">Çağrı</th>
                        <th scope="col" className="px-3 py-2 text-right">Başarılı</th>
                        <th scope="col" className="px-3 py-2 text-right">Hatalı</th>
                        <th scope="col" className="px-3 py-2 text-right">Başarı</th>
                        <th scope="col" className="px-3 py-2 text-right">Token</th>
                        <th scope="col" className="px-3 py-2 text-right">Maliyet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...usage.data.byDay].reverse().map((row) => (
                        <tr key={`${row.date}-${row.operation}`} className="border-t border-border" data-testid="ai-usage-row">
                          <th scope="row" className="px-3 py-2 font-semibold">{shortDate(row.date)}</th>
                          <td className="px-3 py-2">{aiOperationLabel(row.operation)}</td>
                          <td className="px-3 py-2 text-right">{row.calls}</td>
                          <td className="px-3 py-2 text-right">{row.succeeded}</td>
                          <td className="px-3 py-2 text-right">{row.failed + row.rejected}</td>
                          <td className="px-3 py-2 text-right">{formatSuccessRate(row.successRate)}</td>
                          <td className="px-3 py-2 text-right">{formatTokens(row.inputTokens + row.outputTokens + row.thinkingTokens)}</td>
                          <td className="px-3 py-2 text-right">{formatUsd(row.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {usage.data.byUser.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-base">Kullanıcı Bazında</h3>
                <ul className="grid gap-2 sm:grid-cols-2" aria-label="Kullanıcı bazında kullanım">
                  {usage.data.byUser.map((row, index) => (
                    <li key={`${row.userId ?? "sistem"}-${index}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-semibold">{row.system ? "Sistem" : row.user?.fullName || row.user?.userName || "Kullanıcı"}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {row.calls} çağrı · {formatUsd(row.costUsd)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
