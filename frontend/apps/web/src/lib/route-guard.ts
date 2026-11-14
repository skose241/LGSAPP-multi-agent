import type { JwtInfo } from "./jwt";

export type GuardDecision = { type: "next" } | { type: "redirect"; to: string };

export interface GuardInput {
  pathname: string;
  search: string;
  hasAccess: boolean;
  hasRefresh: boolean;
  info: JwtInfo | null;
}

const PUBLIC_PATHS = ["/giris", "/sifremi-unuttum", "/kurtarma"];

function matches(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((base) => matches(pathname, base)) || matches(pathname, "/tasarim");
}

export function decideRoute({ pathname, search, hasAccess, hasRefresh, info }: GuardInput): GuardDecision {
  const params = new URLSearchParams(search);

  if (isPublicPath(pathname)) {
    if (pathname === "/giris" && hasAccess && info && params.get("neden") !== "oturum") {
      return { type: "redirect", to: info.mustChangePassword ? "/sifre-degistir" : "/" };
    }
    return { type: "next" };
  }

  if (!hasAccess && !hasRefresh) {
    const target = `${pathname}${search}`;
    const next = target === "/" ? "" : `?next=${encodeURIComponent(target)}`;
    return { type: "redirect", to: `/giris${next}` };
  }

  if (!info) return { type: "next" };

  if (info.mustChangePassword) {
    return pathname === "/sifre-degistir" ? { type: "next" } : { type: "redirect", to: "/sifre-degistir" };
  }

  if (pathname === "/sifre-degistir") return { type: "redirect", to: "/" };

  const isMudur = info.roles.includes("mudur");
  const isTeacher = info.roles.includes("ogretmen");
  if (matches(pathname, "/yonetim") && !isMudur) return { type: "redirect", to: "/" };
  if (matches(pathname, "/ogretmen") && !isMudur && !isTeacher) return { type: "redirect", to: "/" };

  return { type: "next" };
}
