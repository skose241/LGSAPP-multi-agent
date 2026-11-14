"use client";

import { fieldError } from "@lgs/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ProblemBanner, useCountdown, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { api, run } from "@/lib/api/client";
import { loginSchema, safeNextPath, type LoginValues } from "@/lib/auth/schemas";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<ProblemState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const expired = params.get("neden") === "oturum";

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { userName: "", password: "" } });

  const countdown = useCountdown(problem?.status === 429 ? problem.problem.retryAfter : null, problem?.at);
  const blocked = problem?.status === 429 && countdown > 0;

  async function onSubmit(values: LoginValues) {
    setSubmitting(true);
    setProblem(null);
    const result = await run(() => api().POST("/api/auth/login", { body: values }));
    if (result.ok) {
      queryClient.clear();
      const target = result.data.mustChangePassword ? "/sifre-degistir" : safeNextPath(params.get("next"));
      router.replace(target);
      return;
    }
    setSubmitting(false);
    const userNameError = fieldError(result.problem, "userName");
    const passwordError = fieldError(result.problem, "password");
    if (userNameError) setError("userName", { message: userNameError });
    if (passwordError) setError("password", { message: passwordError });
    setProblem({ status: result.status, problem: result.problem, at: Date.now() });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {expired ? (
        <div role="status" className="flex items-start gap-3 rounded-md border border-info bg-info-soft p-3 text-sm font-medium text-info-soft-foreground">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          Oturumunuzun süresi doldu.
        </div>
      ) : null}
      <ProblemBanner state={problem} countdown={countdown} />
      <TextField
        label="Kullanıcı adı"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        error={errors.userName?.message}
        {...register("userName")}
      />
      <PasswordField label="Şifre" autoComplete="current-password" required error={errors.password?.message} {...register("password")} />
      <Button type="submit" size="lg" loading={submitting} disabled={blocked}>
        {blocked ? `Bekle (${countdown})` : "Giriş Yap"}
      </Button>
      <div className="flex flex-col items-center gap-1 text-sm">
        <Link href="/sifremi-unuttum" className="inline-flex min-h-touch items-center font-semibold text-primary underline underline-offset-4">
          Şifremi unuttum
        </Link>
        <Link href="/kurtarma" className="inline-flex min-h-touch items-center text-muted-foreground underline underline-offset-4">
          Müdür kurtarma
        </Link>
      </div>
    </form>
  );
}
