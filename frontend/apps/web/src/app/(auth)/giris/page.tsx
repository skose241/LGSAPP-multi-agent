import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LicenseLink } from "@/components/license-link";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Giriş" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Giriş yap"
      description="Okulunun verdiği kullanıcı adı ve şifreyle giriş yap."
      footer={<LicenseLink />}
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
