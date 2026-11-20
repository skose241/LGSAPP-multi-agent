import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { RecoverForm } from "@/features/auth/recover-form";

export const metadata: Metadata = { title: "Müdür Kurtarma" };

export default function RecoverPage() {
  return (
    <AuthCard
      title="Müdür Hesabı Kurtarma"
      description="Şifrenizi unuttuysanız, ilk girişte aldığınız kurtarma kodlarından birini kullanarak yeni şifre belirleyin."
    >
      <RecoverForm />
    </AuthCard>
  );
}
