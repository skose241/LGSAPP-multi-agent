"use client";

import { Bell, GraduationCap, House, ImagePlus, ListChecks, Trophy, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NotificationBadge } from "@/components/notification-badge";
import { cn } from "@/lib/utils";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

export const showcaseNav: NavItem[] = [
  { id: "pano", label: "Pano", href: "/tasarim#pano", icon: House },
  { id: "coz", label: "Soru Çöz", href: "/tasarim#coz", icon: ListChecks },
  { id: "yukle", label: "Soru Yükle", href: "/tasarim#yukle", icon: ImagePlus },
  { id: "liderlik", label: "Liderlik", href: "/tasarim#liderlik", icon: Trophy },
  { id: "profil", label: "Profil", href: "/tasarim#profil", icon: UserRound, badge: 3 },
];

interface AppShellProps {
  items: NavItem[];
  tabs?: NavItem[];
  activeId?: string;
  userName: string;
  roleLabel: string;
  contained?: boolean;
  notificationCount?: number;
  notificationsHref?: string;
  sidebarActions?: ReactNode;
  children: ReactNode;
}

function matchActive(items: NavItem[], pathname: string): string | undefined {
  let best: NavItem | undefined;
  for (const item of items) {
    const base = item.href.split("#")[0] ?? item.href;
    const hit = base === "/" ? pathname === "/" : pathname === base || pathname.startsWith(`${base}/`);
    if (hit && (!best || base.length > (best.href.split("#")[0] ?? "").length)) best = item;
  }
  return best?.id;
}

export function AppShell({
  items,
  tabs,
  activeId,
  userName,
  roleLabel,
  contained = false,
  notificationCount = 0,
  notificationsHref,
  sidebarActions,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const active = activeId ?? matchActive([...items, ...(tabs ?? [])], pathname);
  const tabItems = tabs ?? items;
  const position = contained ? "absolute" : "fixed";
  const Side = contained ? "div" : "aside";
  const Top = contained ? "div" : "header";
  const Content = contained ? "div" : "main";

  const bellClasses = "relative flex size-11 items-center justify-center rounded-pill text-foreground hover:bg-surface-muted";
  const bellLabel = notificationCount > 0 ? `Bildirimler, ${notificationCount} okunmamış` : "Bildirimler";
  const bellContent = (
    <>
      <Bell className="size-6" aria-hidden="true" />
      <NotificationBadge count={notificationCount} className="absolute right-1 top-1" />
    </>
  );

  return (
    <div className={cn("bg-background", contained ? "relative h-[680px] overflow-hidden" : "min-h-dvh")}>
      <Side
        className={cn(
          position,
          "inset-y-0 left-0 z-20 hidden w-sidebar flex-col gap-6 overflow-y-auto border-r border-border bg-surface p-4 lg:flex",
        )}
      >
        <div className="flex items-center gap-3 px-2 pt-2">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="size-6" aria-hidden="true" />
          </span>
          <span className="font-display text-lg font-bold">LGS Hazırlık</span>
        </div>
        <nav aria-label="Ana menü" className="flex flex-1 flex-col gap-1">
          {items.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === active} layout="side" />
          ))}
        </nav>
        <div className="flex flex-col gap-2 rounded-md bg-surface-muted p-3">
          <div>
            <p className="text-sm font-semibold">{userName}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          {sidebarActions}
        </div>
      </Side>

      <div className={cn(contained ? "h-full overflow-y-auto" : "min-h-dvh", "lg:pl-sidebar")}>
        <Top className="sticky top-0 z-10 border-b border-border bg-surface/95 pt-safe backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center justify-between px-safe">
            <span className="font-display text-lg font-bold lg:sr-only">LGS Hazırlık</span>
            <span className="hidden text-sm text-muted-foreground lg:block">{roleLabel}</span>
            {notificationsHref ? (
              <Link href={notificationsHref} className={bellClasses} aria-label={bellLabel}>
                {bellContent}
              </Link>
            ) : (
              <button type="button" className={bellClasses} aria-label={bellLabel}>
                {bellContent}
              </button>
            )}
          </div>
        </Top>
        <Content className="mx-auto w-full max-w-screen-2xl px-safe pt-5 pb-tab-clearance">{children}</Content>
      </div>

      <nav
        aria-label="Alt menü"
        className={cn(
          position,
          "inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-safe shadow-nav lg:hidden",
        )}
      >
        <ul className="mx-auto flex max-w-screen-md items-stretch justify-around">
          {tabItems.map((item) => (
            <li key={item.id} className="flex-1">
              <NavLink item={item} active={item.id === active} layout="tab" />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavLink({ item, active, layout }: { item: NavItem; active: boolean; layout: "side" | "tab" }) {
  const Icon = item.icon;

  if (layout === "side") {
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-touch items-center gap-3 rounded-md px-3 text-base font-semibold transition-colors",
          active
            ? "bg-primary-soft text-primary-soft-foreground"
            : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
        <span className="flex-1">{item.label}</span>
        {item.badge ? <NotificationBadge count={item.badge} /> : null}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-tabbar flex-col items-center justify-center gap-1 px-1 text-xs font-semibold transition-colors",
        active ? "text-primary-soft-foreground" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "relative flex h-8 w-14 items-center justify-center rounded-pill transition-colors",
          active && "bg-primary-soft",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
        {item.badge ? <NotificationBadge count={item.badge} className="absolute -right-0.5 -top-1" /> : null}
      </span>
      {item.label}
    </Link>
  );
}
