import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/features/auth/forgot-form";

export const metadata: Metadata = { title: "Şifremi unuttum" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Şifremi unuttum"
      description="Kullanıcı adını yaz. Talebin müdüre iletilir, müdür onaylayınca sana tek seferlik bir şifre verilecek."
      footer={
        <p className="text-muted-foreground">
          Müdür hesabı mı?{" "}
          <Link href="/kurtarma" className="font-semibold text-primary underline underline-offset-4">
            Kurtarma koduyla yenile
          </Link>
        </p>
      }
    >
      <ForgotForm />
    </AuthCard>
  );
}
