"use client";

import { adminUsersQuery, passwordResetRequestsQuery, schedulerStatusQuery } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Timer, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { RunStatusBadge } from "@/features/admin/scheduler-runs";
import { kindLabel, SCHEDULER_KINDS } from "@/lib/admin/scheduler";
import { countByRole } from "@/lib/admin/users";

function Stat({ value, label, loading }: { value: number | null; label: string; loading: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-3xl font-bold" aria-busy={loading || undefined}>
        {loading ? "-" : (value ?? "-")}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function StatCard({ title, icon, href, action, children }: { title: string; icon: ReactNode; href: string; action: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {children}
        <Button asChild variant="secondary" className="self-start">
          <Link href={href}>{action}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SchedulerSummary() {
  const status = useQuery(schedulerStatusQuery(api()));
  if (status.isPending) {
    return <div role="status" aria-label="Zamanlayıcı yükleniyor" className="h-20 animate-pulse rounded-md bg-surface-muted" />;
  }
  if (status.isError) {
    return <p className="text-sm text-muted-foreground">Zamanlayıcı durumu alınamadı.</p>;
  }
  const jobs = SCHEDULER_KINDS.map((kind) => status.data.jobs.find((job) => job.kind === kind)).filter((job) => job !== undefined);
  return (
    <div className="flex flex-col gap-3" data-testid="dashboard-scheduler">
      <p className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Otomatik Zamanlayıcı:</span>
        <Badge tone={status.data.timerEnabled ? "success" : "warning"}>{status.data.timerEnabled ? "Açık" : "Kapalı"}</Badge>
      </p>
      <ul className="flex flex-col gap-1.5">
        {jobs.map((job) => (
          <li key={job.kind} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{kindLabel(job.kind)}</span>
            {job.lastRun ? <RunStatusBadge status={job.lastRun.status} /> : <span className="text-muted-foreground">Henüz Çalışmadı</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MudurDashboard() {
  const users = useQuery(adminUsersQuery(api()));
  const requests = useQuery(passwordResetRequestsQuery(api()));
  const counts = countByRole(users.data ?? []);
  const loadingUsers = users.isPending;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <StatCard title="Kullanıcılar" icon={<Users className="size-5" aria-hidden="true" />} href="/yonetim/kullanicilar" action="Kullanıcılara Git">
        <div className="grid grid-cols-3 gap-3">
          <Stat value={counts.ogrenci} label="Öğrenci" loading={loadingUsers} />
          <Stat value={counts.ogretmen} label="Öğretmen" loading={loadingUsers} />
          <Stat value={counts.mudur} label="Müdür" loading={loadingUsers} />
        </div>
      </StatCard>
      <StatCard title="Şifre Talepleri" icon={<KeyRound className="size-5" aria-hidden="true" />} href="/yonetim/sifre-talepleri" action="Taleplere Git">
        <Stat value={requests.data?.length ?? null} label="Bekleyen Talep" loading={requests.isPending} />
      </StatCard>
      <StatCard title="Zamanlayıcı" icon={<Timer className="size-5" aria-hidden="true" />} href="/yonetim/zamanlayici" action="Zamanlayıcıya Git">
        <SchedulerSummary />
      </StatCard>
    </div>
  );
}
