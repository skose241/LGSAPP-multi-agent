"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ProblemBanner, useCountdown, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { api, run } from "@/lib/api/client";
import { forgotSchema } from "@/lib/auth/schemas";
import type { z } from "zod";

type ForgotValues = z.infer<typeof forgotSchema>;

const SAME_MESSAGE = "Talebiniz okul yönetimine iletildi.";

export function ForgotForm() {
  const [problem, setProblem] = useState<ProblemState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { userName: "" } });
  const countdown = useCountdown(problem?.status === 429 ? problem.problem.retryAfter : null, problem?.at);
  const blocked = problem?.status === 429 && countdown > 0;

  async function onSubmit(values: ForgotValues) {
    setSubmitting(true);
    setProblem(null);
    const result = await run(() => api().POST("/api/auth/forgot-password", { body: values }));
    setSubmitting(false);
    if (result.ok) {
      setDone(true);
      return;
    }
    if (result.status === 429 || result.network || result.status >= 500) {
      setProblem({ status: result.status, problem: result.problem, at: Date.now() });
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <div role="status" className="flex items-start gap-3 rounded-md border border-success bg-success-soft p-3 text-success-soft-foreground">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="font-medium">
            {SAME_MESSAGE} Müdür onaylayınca sana tek seferlik bir şifre verilecek. Şifreni aldıktan sonra giriş yapıp yeni
            şifreni belirleyebilirsin.
          </p>
        </div>
        <Button asChild variant="secondary" size="lg">
          <Link href="/giris">Girişe dön</Link>
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
      <Button type="submit" size="lg" loading={submitting} disabled={blocked}>
        {blocked ? `Bekle (${countdown})` : "Talep gönder"}
      </Button>
      <Link href="/giris" className="inline-flex min-h-touch items-center justify-center text-sm font-semibold text-primary underline underline-offset-4">
        Girişe dön
      </Link>
    </form>
  );
}
