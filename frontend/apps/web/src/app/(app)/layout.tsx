"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { SessionActions } from "@/features/auth/session-actions";
import { useMe } from "@/features/auth/use-me";
import { navFor, roleLabel } from "@/lib/nav";
import { CloudOff } from "lucide-react";

const RECOVERY_PAGE = "/profil/kurtarma-kodlari";

function redirectTarget(pathname: string, me: { role: string; mustChangePassword: boolean; recoveryCodesMissing: boolean }) {
  if (me.mustChangePassword) return "/sifre-degistir";
  if (me.role === "mudur" && me.recoveryCodesMissing && pathname !== RECOVERY_PAGE) return RECOVERY_PAGE;
  const underYonetim = pathname === "/yonetim" || pathname.startsWith("/yonetim/");
  const underOgretmen = pathname === "/ogretmen" || pathname.startsWith("/ogretmen/");
  if (underYonetim && me.role !== "mudur") return "/";
  if (underOgretmen && me.role !== "mudur" && me.role !== "ogretmen") return "/";
  return null;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const target = me.data ? redirectTarget(pathname, me.data) : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (me.isPending || target) {
    return (
      <div role="status" aria-label="Yükleniyor" className="flex min-h-dvh items-center justify-center bg-background">
        <div className="size-10 animate-spin rounded-pill border-4 border-primary-200 border-t-primary" />
      </div>
    );
  }

  if (me.isError || !me.data) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center px-safe">
        <EmptyState
          icon={CloudOff}
          title="Bağlantı kurulamadı"
          description="Bilgilerin yüklenemedi. İnternet bağlantını kontrol edip tekrar dene."
          action={<Button onClick={() => me.refetch()}>Tekrar Dene</Button>}
        />
      </div>
    );
  }

  const nav = navFor(me.data.role);

  return (
    <AppShell
      items={nav.items}
      tabs={nav.tabs}
      userName={`${me.data.firstName} ${me.data.lastName}`.trim() || me.data.userName}
      roleLabel={roleLabel(me.data.role)}
      notificationsHref="/bildirimler"
      sidebarActions={<SessionActions />}
    >
      {children}
    </AppShell>
  );
}
