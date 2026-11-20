import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/features/auth/forgot-form";

export const metadata: Metadata = { title: "Şifremi Unuttum" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Şifremi Unuttum"
      description="Kullanıcı adınızı yazın. Talebiniz müdüre iletilir, müdür onaylayınca size tek seferlik bir şifre verilecek."
      footer={
        <p className="text-muted-foreground">
          Müdür hesabı mı?{" "}
          <Link href="/kurtarma" className="font-semibold text-primary underline underline-offset-4">
            Kurtarma Koduyla Yenile
          </Link>
        </p>
      }
    >
      <ForgotForm />
    </AuthCard>
  );
}
