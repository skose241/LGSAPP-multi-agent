"use client";

import { fieldError } from "@lgs/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ProblemBanner, useCountdown, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { api, run } from "@/lib/api/client";
import { maskRecoveryCode, MIN_PASSWORD_LENGTH, recoverSchema } from "@/lib/auth/schemas";
import type { z } from "zod";

type RecoverValues = z.infer<typeof recoverSchema>;

export function RecoverForm() {
  const [problem, setProblem] = useState<ProblemState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RecoverValues>({
    resolver: zodResolver(recoverSchema),
    defaultValues: { userName: "", recoveryCode: "", newPassword: "" },
  });
  const countdown = useCountdown(problem?.status === 429 ? problem.problem.retryAfter : null, problem?.at);
  const blocked = problem?.status === 429 && countdown > 0;

  async function onSubmit(values: RecoverValues) {
    setSubmitting(true);
    setProblem(null);
    const result = await run(() => api().POST("/api/auth/recover", { body: values }));
    setSubmitting(false);
    if (result.ok) {
      setRemaining(result.data.remainingRecoveryCodes);
      return;
    }
    const code = fieldError(result.problem, "recoveryCode");
    const password = fieldError(result.problem, "newPassword");
    if (code) setError("recoveryCode", { message: code });
    if (password) setError("newPassword", { message: password });
    setProblem({ status: result.status, problem: result.problem, at: Date.now() });
  }

  if (remaining !== null) {
    return (
      <div className="flex flex-col gap-4">
        <div role="status" className="flex items-start gap-3 rounded-md border border-success bg-success-soft p-3 text-success-soft-foreground">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="font-medium">
            <p>Şifren yenilendi. Yeni şifrenle giriş yapabilirsin.</p>
            <p className="pt-1 text-sm">Kalan kurtarma kodu sayısı: {remaining}</p>
          </div>
        </div>
        <Button asChild size="lg">
          <Link href="/giris">Giriş yap</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
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
      <Controller
        control={control}
        name="recoveryCode"
        render={({ field }) => (
          <TextField
            label="Kurtarma kodu"
            placeholder="XXXX-XXXX-XXXX"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={14}
            required
            className="font-mono"
            error={errors.recoveryCode?.message}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={field.value}
            onChange={(event) => field.onChange(maskRecoveryCode(event.target.value))}
          />
        )}
      />
      <PasswordField
        label="Yeni şifre"
        autoComplete="new-password"
        required
        hint={`En az ${MIN_PASSWORD_LENGTH.mudur} karakter, bir rakam, bir büyük ve bir küçük harf.`}
        error={errors.newPassword?.message}
        {...register("newPassword")}
      />
      <Button type="submit" size="lg" loading={submitting} disabled={blocked}>
        {blocked ? `Bekle (${countdown})` : "Şifremi yenile"}
      </Button>
      <Link href="/giris" className="inline-flex min-h-touch items-center justify-center text-sm font-semibold text-primary underline underline-offset-4">
        Girişe dön
      </Link>
    </form>
  );
}
