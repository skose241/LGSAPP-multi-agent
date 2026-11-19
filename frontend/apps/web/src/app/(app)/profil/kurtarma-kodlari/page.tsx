"use client";

import "@/lib/zod-config";
import { fieldError } from "@lgs/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ProblemBanner, useCountdown, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordField } from "@/components/ui/password-field";
import { RecoveryCodesPanel } from "@/features/auth/recovery-codes-panel";
import { ME_KEY, useMe } from "@/features/auth/use-me";
import { api, run } from "@/lib/api/client";
import { regenerateSchema } from "@/lib/auth/schemas";
import type { z } from "zod";

type RegenerateValues = z.infer<typeof regenerateSchema>;

export default function RecoveryCodesPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<ProblemState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const status = useQuery({
    queryKey: ["recovery-status"],
    enabled: me.data?.role === "mudur",
    queryFn: async () => {
      const result = await run(() => api().GET("/api/auth/recovery-codes/status"));
      if (!result.ok) throw new Error(result.problem.message);
      return result.data.remaining;
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<RegenerateValues>({ resolver: zodResolver(regenerateSchema), defaultValues: { currentPassword: "" } });
  const countdown = useCountdown(problem?.status === 429 ? problem.problem.retryAfter : null, problem?.at);

  async function onSubmit(values: RegenerateValues) {
    setSubmitting(true);
    setProblem(null);
    const result = await run(() => api().POST("/api/auth/recovery-codes/regenerate", { body: values }));
    setSubmitting(false);
    if (result.ok) {
      reset();
      setCodes(result.data.recoveryCodes);
      return;
    }
    const current = fieldError(result.problem, "currentPassword");
    if (current) setError("currentPassword", { message: current });
    setProblem({ status: result.status, problem: result.problem, at: Date.now() });
  }

  if (me.data && me.data.role !== "mudur") {
    return <p className="text-muted-foreground">Bu sayfa yalnızca müdür içindir.</p>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl">Kurtarma kodları</h1>
      {codes ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Yeni kodların</CardTitle>
            <CardDescription>Eski kodların hepsi iptal edildi.</CardDescription>
          </CardHeader>
          <CardContent>
            <RecoveryCodesPanel
              codes={codes}
              confirmLabel="Kaydettim, kapat"
              onConfirm={async () => {
                setCodes(null);
                await queryClient.invalidateQueries({ queryKey: ME_KEY });
                await queryClient.invalidateQueries({ queryKey: ["recovery-status"] });
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              Kalan kod sayısı: {status.data ?? "-"}
            </CardTitle>
            <CardDescription>
              {me.data?.recoveryCodesMissing
                ? "Hiç kurtarma kodun kalmadı. Devam etmeden önce yeni kodlar üretmelisin."
                : "Yeni kodlar ürettiğinde mevcut kodların hepsi iptal olur. Devam etmek için şifreni gir."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
              <ProblemBanner state={problem} countdown={countdown} />
              <PasswordField
                label="Mevcut şifre"
                autoComplete="current-password"
                required
                error={errors.currentPassword?.message}
                {...register("currentPassword")}
              />
              <Button type="submit" size="lg" loading={submitting}>
                Yeni kodlar üret
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
