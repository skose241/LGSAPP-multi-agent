"use client";

import { aiGatePurposeLabel, aiErrorKindLabel, aiProviderLabel, formatDateTimeShort, usagePercent } from "@lgs/api";
import { aiAdminStatusQuery } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, PauseCircle, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";

function Flag({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span className={on ? "inline-flex items-center gap-1.5 font-semibold text-correct-soft-foreground" : "inline-flex items-center gap-1.5 font-semibold text-wrong-soft-foreground"}>
      {on ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
      {on ? onLabel : offLabel}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold">{children}</dd>
    </div>
  );
}

export function AiStatusCard() {
  const status = useQuery(aiAdminStatusQuery(api()));

  if (status.isPending) {
    return <div role="status" aria-label="Durum yükleniyor" className="h-64 animate-pulse rounded-lg bg-surface-muted" />;
  }

  if (status.isError) {
    return (
      <EmptyState
        icon={CloudOff}
        as="h2"
        title="Yapay Zekâ Durumu Alınamadı"
        description={status.error.message}
        action={<Button onClick={() => status.refetch()}>Tekrar Dene</Button>}
      />
    );
  }

  const data = status.data;
  const percent = usagePercent(data.todayGlobalUsed, data.globalLimit);
  const tripped = data.gates.filter((gate) => gate.tripped);

  return (
    <Card data-testid="ai-status">
      <CardHeader>
        <CardTitle as="h2">Sağlayıcı Durumu</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Sağlayıcı">
            <span data-testid="ai-provider">{aiProviderLabel(data.provider)}</span>
          </Row>
          <Row label="Yapılandırma">
            <Flag on={data.aiConfigured} onLabel="Yapılandırıldı" offLabel="Yapılandırılmadı" />
          </Row>
          <Row label="Soru Üretimi">
            <Flag on={data.questionConfigured} onLabel="Hazır" offLabel="Hazır Değil" />
          </Row>
          <Row label="Çözüm">
            <Flag on={data.solutionConfigured} onLabel="Hazır" offLabel="Hazır Değil" />
          </Row>
          <Row label="Soru Modeli">{data.questionModel ?? "-"}</Row>
          <Row label="Çözüm Modeli">{data.solutionModel ?? "-"}</Row>
          <Row label="Öğrenci Çözüm İsteği">
            <Flag on={data.aiCozumAktifMi} onLabel="Açık" offLabel="Kapalı" />
          </Row>
          <Row label="Soru Doğrulama">
            <Flag on={data.verificationEnabled} onLabel="Açık" offLabel="Kapalı" />
          </Row>
        </dl>

        <div className="flex flex-col gap-2" data-testid="ai-global-usage">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Bugünkü Genel Kullanım</p>
            <p className="text-sm">
              <span className="font-display text-xl font-bold">{data.todayGlobalUsed}</span> / {data.globalLimit}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Bugünkü genel çözüm kullanımı"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-3 overflow-hidden rounded-pill bg-surface-muted"
          >
            <div className={percent >= 90 ? "h-full bg-danger" : percent >= 70 ? "h-full bg-warning" : "h-full bg-primary"} style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Sayaç {formatDateTimeShort(data.quotaResetsAt)} tarihinde sıfırlanır.</p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-base">Devre Kesiciler</h3>
          {tripped.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-correct-soft-foreground" data-testid="ai-gates-ok">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Tüm devre kesiciler açık, çağrılar sorunsuz ilerliyor.
            </p>
          ) : null}
          <ul className="flex flex-col gap-2" aria-label="Devre kesici durumları">
            {data.gates.map((gate) => (
              <li
                key={gate.purpose}
                data-testid="ai-gate"
                data-tripped={gate.tripped}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
              >
                <span className="font-semibold">{aiGatePurposeLabel(gate.purpose)}</span>
                {gate.tripped ? (
                  <>
                    <Badge tone="warning">
                      <PauseCircle aria-hidden="true" />
                      Durduruldu
                    </Badge>
                    {gate.kind ? <span>{aiErrorKindLabel(gate.kind)}</span> : null}
                    {gate.until ? <span className="text-muted-foreground">{formatDateTimeShort(gate.until)} tarihine kadar</span> : null}
                    {gate.reason ? <span className="w-full text-muted-foreground">{gate.reason}</span> : null}
                  </>
                ) : (
                  <Badge tone="success">Çalışıyor</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
