"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { LicenseLink } from "@/components/license-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/change-password-form";
import { ProfileStats } from "@/features/student/profile-stats";
import { SessionActions } from "@/features/auth/session-actions";
import { useMe } from "@/features/auth/use-me";
import { minPasswordLength } from "@/lib/auth/schemas";
import { roleLabel } from "@/lib/nav";

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold">{value}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const me = useMe();
  const user = me.data;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Profil</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Bilgilerim</CardTitle>
            <CardDescription>Hesap bilgilerinizi müdür yönetir.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <dl className="grid grid-cols-2 gap-4">
              <Info label="Ad" value={user?.firstName ?? ""} />
              <Info label="Soyad" value={user?.lastName ?? ""} />
              <Info label="Kullanıcı Adı" value={user?.userName ?? ""} />
              <Info label="Rol" value={roleLabel(user?.role)} />
              {user?.className ? <Info label="Sınıf" value={user.className} /> : null}
              {user?.role === "ogretmen" ? <Info label="Branş" value={user.branchLessonName ?? "Atanmamış"} /> : null}
            </dl>
            {user?.role === "mudur" ? (
              <Button asChild variant="secondary" className="self-start">
                <Link href="/profil/kurtarma-kodlari">
                  <KeyRound aria-hidden="true" />
                  Kurtarma Kodları
                </Link>
              </Button>
            ) : null}
            <div className="border-t border-border pt-4 lg:hidden">
              <SessionActions layout="row" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">Şifre Değiştir</CardTitle>
            <CardDescription>Şifrenizi değiştirdiğinizde diğer cihazlardaki oturumlarınız kapanır.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm
              minLength={minPasswordLength(user?.role)}
              onSuccess={() => {
                toast.success("Şifreniz değiştirildi.");
              }}
            />
          </CardContent>
        </Card>
      </div>
      {user?.role === "ogrenci" ? <ProfileStats /> : null}
      <LicenseLink className="self-start" />
    </div>
  );
}
