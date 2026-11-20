"use client";

import { fieldError, isApiError, type ParsedProblem } from "@lgs/api";
import { adminKeys, adminMutations, lessonsQuery, type CreatedUser } from "@lgs/api/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { OneTimePasswordPanel } from "@/features/admin/one-time-password";
import { api } from "@/lib/api/client";
import { createUserSchema, toCreateBody, type CreateUserValues } from "@/lib/admin/schemas";
import { fullName } from "@/lib/admin/users";

type FieldName = "userName" | "firstName" | "lastName" | "className" | "role";
const FIELDS: FieldName[] = ["userName", "firstName", "lastName", "className", "role"];

function initialRole(value: string | null): CreateUserValues["role"] {
  return value === "mudur" ? "mudur" : "ogrenci";
}

export function CreateUserForm() {
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const lessons = useQuery(lessonsQuery(api()));
  const [problem, setProblem] = useState<ProblemState | null>(null);
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const lockedMudur = params.get("rol") === "mudur";

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      role: initialRole(params.get("rol")),
      userName: "",
      firstName: "",
      lastName: "",
      className: "",
      branchLessonId: "",
      confirmMudur: false,
    },
  });
  const role = watch("role");

  const mutation = useMutation({
    mutationFn: (values: CreateUserValues) => adminMutations.createUser(api(), toCreateBody(values)),
    onSuccess: async (data) => {
      setCreated(data);
      await queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
    onError: (error: unknown) => {
      if (!isApiError(error)) {
        setProblem({ status: 0, at: Date.now(), problem: emptyProblem("Bağlantı kurulamadı. Tekrar deneyin.") });
        return;
      }
      applyServerErrors(error.status, error.problem, setError);
      setProblem({ status: error.status, problem: error.problem, at: Date.now() });
    },
  });

  function onSubmit(values: CreateUserValues) {
    setProblem(null);
    mutation.mutate(values);
  }

  if (created) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div>
            <h2 className="text-2xl">Hesap Oluşturuldu</h2>
            <p className="text-muted-foreground">{fullName(created.user)} için tek seferlik şifre aşağıda.</p>
          </div>
          <OneTimePasswordPanel
            userName={created.user.userName}
            displayName={fullName(created.user)}
            password={created.oneTimePassword}
          >
            <div className="flex flex-wrap gap-3 border-t border-border pt-4">
              <Button
                type="button"
                onClick={() => {
                  setCreated(null);
                  reset();
                }}
              >
                Şifreyi Not Aldım, Yeni Kullanıcı Ekle
              </Button>
              <Button asChild variant="secondary">
                <Link href="/yonetim/kullanicilar">Listeye Dön</Link>
              </Button>
            </div>
          </OneTimePasswordPanel>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <ProblemBanner state={problem} conflictAsMessage />

          {lockedMudur ? (
            <div className="flex flex-col gap-3 rounded-md border border-warning bg-warning-soft p-4 text-warning-soft-foreground">
              <p className="flex items-start gap-2 font-semibold">
                <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                Yeni Müdür Hesabı
              </p>
              <p className="text-sm">
                Müdür hesabı tüm kullanıcıları yönetebilir, ban ve şifre işlemlerini yapabilir. Yalnızca güvendiğiniz kişiler
                için oluşturun.
              </p>
              <label className="flex min-h-touch cursor-pointer items-center gap-3 text-base font-semibold">
                <input type="checkbox" className="size-6 shrink-0 accent-primary" {...register("confirmMudur")} />
                Müdür hesabı oluşturmak istediğimi onaylıyorum
              </label>
              {errors.confirmMudur?.message ? (
                <p role="alert" className="text-sm font-medium text-danger-soft-foreground">
                  {errors.confirmMudur.message}
                </p>
              ) : null}
              <input type="hidden" {...register("role")} value="mudur" />
            </div>
          ) : (
            <SelectField label="Rol" required error={errors.role?.message} {...register("role")}>
              <option value="ogrenci">Öğrenci</option>
              <option value="ogretmen">Öğretmen</option>
            </SelectField>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Kullanıcı Adı"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              hint="Türkçe harf, rakam, nokta, alt çizgi ve tire kullanılabilir."
              error={errors.userName?.message}
              {...register("userName")}
            />
            <div className="hidden md:block" />
            <TextField label="Ad" required autoComplete="off" error={errors.firstName?.message} {...register("firstName")} />
            <TextField label="Soyad" required autoComplete="off" error={errors.lastName?.message} {...register("lastName")} />
            {role === "ogrenci" ? (
              <TextField label="Sınıf" autoComplete="off" placeholder="8-A" error={errors.className?.message} {...register("className")} />
            ) : null}
            {role === "ogretmen" ? (
              <SelectField
                label="Branş Dersi"
                hint="İsteğe bağlı. Öğretmen yalnızca bu dersin konu planını yönetir."
                disabled={lessons.isPending}
                {...register("branchLessonId")}
              >
                <option value="">Branş Yok</option>
                {(lessons.data ?? []).map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.name}
                  </option>
                ))}
              </SelectField>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" loading={mutation.isPending}>
              {lockedMudur ? "Müdür Hesabı Oluştur" : "Hesap Oluştur"}
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/yonetim/kullanicilar">Vazgeç</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function emptyProblem(message: string): ParsedProblem {
  return { message, fieldErrors: {}, formError: null, retryAfter: null };
}

function applyServerErrors(
  status: number,
  problem: ParsedProblem,
  setError: (name: FieldName, error: { message: string }) => void,
) {
  let mapped = false;
  for (const name of FIELDS) {
    const message = fieldError(problem, name);
    if (message) {
      setError(name, { message });
      mapped = true;
    }
  }
  if (!mapped && (status === 409 || /kullanıcı adı/i.test(problem.message))) {
    setError("userName", { message: problem.message });
  }
}
