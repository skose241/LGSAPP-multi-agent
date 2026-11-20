import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LicenseLink } from "@/components/license-link";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Giriş" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Giriş Yap"
      description="Okulunuzun verdiği kullanıcı adı ve şifreyle giriş yapın."
      footer={<LicenseLink />}
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
