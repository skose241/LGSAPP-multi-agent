"use client";

import { BookOpenCheck, ClipboardList, FilePlus2, Flag, ImagePlus, Trophy, Users } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { MudurDashboard } from "@/features/admin/mudur-dashboard";
import { useMe } from "@/features/auth/use-me";

interface Panel {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  action: string;
}

const panels: Record<string, Panel[]> = {
  ogrenci: [
    {
      icon: ClipboardList,
      title: "Aktif ödevler",
      description: "Öğretmenin verdiği ödevler burada görünecek.",
      href: "/odevler",
      action: "Ödevlere git",
    },
    {
      icon: BookOpenCheck,
      title: "Bugünkü hedefin",
      description: "Çözdüğün soru sayısı ve günlük hedefin burada görünecek.",
      href: "/soru-coz",
      action: "Soru çöz",
    },
    {
      icon: Trophy,
      title: "Haftalık sıralama",
      description: "Sınıf arkadaşlarınla sıralaman burada görünecek.",
      href: "/liderlik",
      action: "Liderliğe bak",
    },
    {
      icon: ImagePlus,
      title: "Soru yükle",
      description: "Takıldığın bir soruyu fotoğrafla yükleyip nerede takıldığını anlat.",
      href: "/soru-yukle",
      action: "Soru yükle",
    },
  ],
  ogretmen: [
    {
      icon: ClipboardList,
      title: "Ödevler",
      description: "Verdiğin ödevler ve öğrencilerin katılımı burada görünecek.",
      href: "/ogretmen/odevler",
      action: "Ödev yönetimi",
    },
    {
      icon: Flag,
      title: "Bekleyen şikâyetler",
      description: "Öğrencilerin şikâyet ettiği sorular burada listelenecek.",
      href: "/ogretmen/sikayetler",
      action: "Şikâyetlere git",
    },
    {
      icon: FilePlus2,
      title: "Havuza soru ekle",
      description: "Bugün veya ileri bir tarih için havuza soru ekleyebileceksin.",
      href: "/ogretmen/soru-ekle",
      action: "Soru ekle",
    },
    {
      icon: Users,
      title: "Öğrenciler",
      description: "Öğrenci profilleri ve istatistikleri burada görünecek.",
      href: "/ogretmen/ogrenciler",
      action: "Öğrencilere git",
    },
  ],
};

export default function DashboardPage() {
  const me = useMe();
  const role = me.data?.role ?? "ogrenci";
  const items = role === "mudur" ? [] : (panels[role] ?? panels["ogrenci"] ?? []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">Merhaba {me.data?.firstName ?? ""}</h1>
        <p className="text-muted-foreground">Bu sayfa hazırlanıyor. Veriler ilgili ekranlar eklendikçe burada görünecek.</p>
      </div>
      {role === "mudur" ? <MudurDashboard /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((panel) => (
          <EmptyState
            key={panel.href}
            as="h2"
            icon={panel.icon}
            title={panel.title}
            description={panel.description}
            action={
              <Button asChild variant="secondary">
                <Link href={panel.href}>{panel.action}</Link>
              </Button>
            }
          />
        ))}
      </div>
    </div>
  );
}
