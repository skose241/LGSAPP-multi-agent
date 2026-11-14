import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { RecoverForm } from "@/features/auth/recover-form";

export const metadata: Metadata = { title: "Müdür kurtarma" };

export default function RecoverPage() {
  return (
    <AuthCard
      title="Müdür hesabı kurtarma"
      description="Şifreni unuttuysan, ilk girişte aldığın kurtarma kodlarından birini kullanarak yeni şifre belirle."
    >
      <RecoverForm />
    </AuthCard>
  );
}
