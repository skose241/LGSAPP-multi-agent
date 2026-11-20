"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { ChangePasswordForm } from "@/features/auth/change-password-form";
import { ME_KEY, useMe } from "@/features/auth/use-me";
import { holdRecoveryCodes } from "@/lib/auth/recovery-store";
import { minPasswordLength } from "@/lib/auth/schemas";

export function ForcedPasswordChange() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();

  if (me.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        Yükleniyor
      </p>
    );
  }

  return (
    <AuthCard
      title="Yeni Şifrenizi Belirleyin"
      description="Güvenliğiniz için okulunuzun verdiği tek seferlik şifreyi değiştirmeniz gerekiyor."
    >
      <ChangePasswordForm
        minLength={minPasswordLength(me.data?.role)}
        submitLabel="Şifreyi Kaydet"
        onSuccess={async (codes) => {
          await queryClient.invalidateQueries({ queryKey: ME_KEY });
          if (codes) {
            holdRecoveryCodes(codes);
            router.replace("/kurtarma-kodlari/yeni");
            return;
          }
          router.replace("/");
        }}
      />
    </AuthCard>
  );
}
