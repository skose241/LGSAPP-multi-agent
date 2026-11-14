"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { RecoveryCodesPanel } from "@/features/auth/recovery-codes-panel";
import { clearRecoveryCodes, peekRecoveryCodes } from "@/lib/auth/recovery-store";

export function NewRecoveryCodes() {
  const router = useRouter();
  const [codes, setCodes] = useState<string[] | null>(null);

  useEffect(() => {
    const held = peekRecoveryCodes();
    if (!held) {
      router.replace("/profil/kurtarma-kodlari");
      return;
    }
    setCodes(held);
  }, [router]);

  if (!codes) {
    return (
      <p role="status" className="text-muted-foreground">
        Yükleniyor
      </p>
    );
  }

  return (
    <AuthCard title="Kurtarma kodların" description="Müdür hesabı için 10 tek kullanımlık kurtarma kodu üretildi.">
      <RecoveryCodesPanel
        codes={codes}
        onConfirm={() => {
          clearRecoveryCodes();
          setCodes(null);
          router.replace("/");
        }}
      />
    </AuthCard>
  );
}
