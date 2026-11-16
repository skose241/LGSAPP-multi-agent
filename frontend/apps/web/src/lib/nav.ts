import {
  BookOpenCheck,
  CalendarClock,
  ClipboardList,
  FilePlus2,
  Flag,
  GraduationCap,
  House,
  ImagePlus,
  KeyRound,
  LayoutGrid,
  ListChecks,
  Settings,
  ShieldQuestion,
  Sparkles,
  Timer,
  Trophy,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NavItem } from "@/components/app-shell";

export type AppRole = "mudur" | "ogretmen" | "ogrenci";

export interface NavConfig {
  items: NavItem[];
  tabs: NavItem[];
}

const item = (id: string, label: string, href: string, icon: LucideIcon): NavItem => ({ id, label, href, icon });

const pano = item("pano", "Pano", "/", House);
const liderlik = item("liderlik", "Liderlik", "/liderlik", Trophy);
const profil = item("profil", "Profil", "/profil", UserRound);
const menu = item("menu", "Menü", "/menu", LayoutGrid);

const studentItems: NavItem[] = [
  pano,
  item("coz", "Soru Çöz", "/sorular", ListChecks),
  item("yukle", "Soru Yükle", "/soru-yukle", ImagePlus),
  item("odevler", "Ödevler", "/odevler", ClipboardList),
  liderlik,
  profil,
];

const teacherItems: NavItem[] = [
  pano,
  item("odevler", "Ödev Yönetimi", "/ogretmen/odevler", ClipboardList),
  item("havuz", "Havuza Soru Ekle", "/ogretmen/soru-ekle", FilePlus2),
  item("sikayetler", "Şikâyetler", "/ogretmen/sikayetler", Flag),
  item("supheli", "Şüpheli Anahtarlar", "/ogretmen/supheli-anahtarlar", ShieldQuestion),
  item("konu-plani", "Konu Planı", "/ogretmen/konu-plani", CalendarClock),
  item("ogrenciler", "Öğrenciler", "/ogretmen/ogrenciler", GraduationCap),
  item("cozum-bekleyen", "Çözüm Bekleyenler", "/ogretmen/cozum-bekleyenler", BookOpenCheck),
  liderlik,
  profil,
];

const mudurItems: NavItem[] = [
  pano,
  item("kullanicilar", "Kullanıcılar", "/yonetim/kullanicilar", Users),
  item("sifre-talepleri", "Şifre Talepleri", "/yonetim/sifre-talepleri", KeyRound),
  item("zamanlayici", "Zamanlayıcı", "/yonetim/zamanlayici", Timer),
  item("ders-programi", "Ders Programı", "/yonetim/ders-programi", CalendarClock),
  item("yapay-zeka", "Yapay Zekâ", "/yonetim/yapay-zeka", Sparkles),
  item("ayarlar", "Ayarlar", "/yonetim/ayarlar", Settings),
  item("sikayetler", "Şikâyetler", "/ogretmen/sikayetler", Flag),
  liderlik,
  profil,
];

const extraTitles: Record<string, string> = {
  "/bildirimler": "Bildirimler",
};

function withBadges(config: NavConfig, badges: Record<string, number>): NavConfig {
  const apply = (entry: NavItem): NavItem => {
    const count = badges[entry.id];
    return count ? { ...entry, badge: count } : entry;
  };
  return { items: config.items.map(apply), tabs: config.tabs.map(apply) };
}

export function navFor(role: string | undefined, badges: Record<string, number> = {}): NavConfig {
  return withBadges(baseNavFor(role), badges);
}

function baseNavFor(role: string | undefined): NavConfig {
  if (role === "mudur") {
    return { items: mudurItems, tabs: [pano, mudurItems[1]!, mudurItems[2]!, liderlik, menu] };
  }
  if (role === "ogretmen") {
    return { items: teacherItems, tabs: [pano, teacherItems[1]!, teacherItems[3]!, liderlik, menu] };
  }
  return {
    items: studentItems,
    tabs: [pano, studentItems[1]!, studentItems[2]!, liderlik, profil],
  };
}

export function roleLabel(role: string | undefined): string {
  if (role === "mudur") return "Müdür";
  if (role === "ogretmen") return "Öğretmen";
  if (role === "ogrenci") return "Öğrenci";
  return "";
}

export function pageTitleFor(pathname: string): string | null {
  const known = [...studentItems, ...teacherItems, ...mudurItems].find((entry) => entry.href === pathname);
  return known?.label ?? extraTitles[pathname] ?? null;
}

