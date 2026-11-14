"use client";

import { fieldError } from "@lgs/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ProblemBanner, useCountdown, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { api, run } from "@/lib/api/client";
import { changePasswordSchema, type ChangePasswordValues } from "@/lib/auth/schemas";

interface ChangePasswordFormProps {
  minLength: number;
  onSuccess: (recoveryCodes: string[] | null) => void | Promise<void>;
  submitLabel?: string;
}

export function ChangePasswordForm({ minLength, onSuccess, submitLabel = "Şifreyi değiştir" }: ChangePasswordFormProps) {
  const [problem, setProblem] = useState<ProblemState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema(minLength)),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const countdown = useCountdown(problem?.status === 429 ? problem.problem.retryAfter : null, problem?.at);

  async function onSubmit(values: ChangePasswordValues) {
    setSubmitting(true);
    setProblem(null);
    const result = await run(() =>
      api().POST("/api/auth/change-password", {
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      }),
    );
    if (result.ok) {
      reset();
      const codes = result.data.recoveryCodes && result.data.recoveryCodes.length > 0 ? result.data.recoveryCodes : null;
      await onSuccess(codes);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    const current = fieldError(result.problem, "currentPassword");
    const next = fieldError(result.problem, "newPassword");
    if (current) setError("currentPassword", { message: current });
    if (next) setError("newPassword", { message: next });
    setProblem({ status: result.status, problem: result.problem, at: Date.now() });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <ProblemBanner state={problem} countdown={countdown} />
      <PasswordField
        label="Mevcut şifre"
        autoComplete="current-password"
        required
        error={errors.currentPassword?.message}
        {...register("currentPassword")}
      />
      <PasswordField
        label="Yeni şifre"
        autoComplete="new-password"
        required
        hint={`En az ${minLength} karakter, bir rakam, bir büyük ve bir küçük harf.`}
        error={errors.newPassword?.message}
        {...register("newPassword")}
      />
      <PasswordField
        label="Yeni şifre (tekrar)"
        autoComplete="new-password"
        required
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />
      <Button type="submit" size="lg" loading={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
