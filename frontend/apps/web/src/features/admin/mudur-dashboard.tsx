"use client";

import { adminUsersQuery, passwordResetRequestsQuery } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { Hammer, KeyRound, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";
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

export function MudurDashboard() {
  const users = useQuery(adminUsersQuery(api()));
  const requests = useQuery(passwordResetRequestsQuery(api()));
  const counts = countByRole(users.data ?? []);
  const loadingUsers = users.isPending;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <StatCard title="Kullanıcılar" icon={<Users className="size-5" aria-hidden="true" />} href="/yonetim/kullanicilar" action="Kullanıcılara git">
        <div className="grid grid-cols-3 gap-3">
          <Stat value={counts.ogrenci} label="Öğrenci" loading={loadingUsers} />
          <Stat value={counts.ogretmen} label="Öğretmen" loading={loadingUsers} />
          <Stat value={counts.mudur} label="Müdür" loading={loadingUsers} />
        </div>
      </StatCard>
      <StatCard title="Şifre talepleri" icon={<KeyRound className="size-5" aria-hidden="true" />} href="/yonetim/sifre-talepleri" action="Taleplere git">
        <Stat value={requests.data?.length ?? null} label="Bekleyen talep" loading={requests.isPending} />
      </StatCard>
      <EmptyState
        icon={Hammer}
        as="h2"
        title="Zamanlayıcı"
        description="Günlük görevlerin durumu ve elle çalıştırma çok yakında burada olacak."
      />
    </div>
  );
}
