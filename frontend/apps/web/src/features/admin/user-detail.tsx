"use client";

import { formatDateTime, isApiError } from "@lgs/api";
import { adminKeys, adminMutations, adminUserQuery, lessonsQuery, type AdminUser } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, BookOpen, CloudOff, Flag, KeyRound, ShieldCheck, UserPen } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { EditUserDialog } from "@/features/admin/edit-user-dialog";
import { OneTimePasswordDialog } from "@/features/admin/one-time-password-dialog";
import { RoleBadge, UserStatusBadges } from "@/features/admin/user-badges";
import { useMe } from "@/features/auth/use-me";
import { api } from "@/lib/api/client";
import { fullName, userActions, userLabelOf, type ActionState } from "@/lib/admin/users";

type DialogKind = "ban" | "unban" | "regenerate" | "branch" | "edit" | null;

function toProblem(error: unknown): ProblemState {
  if (isApiError(error)) return { status: error.status, problem: error.problem, at: Date.now() };
  return {
    status: 0,
    at: Date.now(),
    problem: { message: "Bağlantı kurulamadı. Tekrar deneyin.", fieldErrors: {}, formError: null, retryAfter: null },
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-base font-semibold">{children}</dd>
    </div>
  );
}

function ActionRow({
  icon,
  title,
  description,
  label,
  state,
  tone = "secondary",
  onClick,
  testId,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  label: string;
  state: ActionState;
  tone?: "secondary" | "danger";
  onClick: () => void;
  testId: string;
}) {
  const reasonId = useId();
  return (
    <li className="flex flex-col gap-2 border-t border-border py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
          {!state.allowed && state.reason ? (
            <p id={reasonId} className="pt-1 text-sm font-medium text-warning-soft-foreground" data-testid={`${testId}-reason`}>
              {state.reason}
            </p>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        variant={tone}
        disabled={!state.allowed}
        aria-describedby={!state.allowed ? reasonId : undefined}
        onClick={onClick}
        data-testid={testId}
        className="self-start sm:self-center"
      >
        {label}
      </Button>
    </li>
  );
}

export function UserDetail({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const me = useMe();
  const user = useQuery(adminUserQuery(api(), id));
  const lessons = useQuery(lessonsQuery(api()));
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [error, setError] = useState<ProblemState | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ userName: string; displayName: string; password: string } | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: adminKeys.users() });
  }

  function close() {
    setDialog(null);
    setError(null);
    setBranch(null);
  }

  const ban = useMutation({
    mutationFn: () => adminMutations.ban(api(), id),
    onSuccess: async () => {
      await refresh();
      toast.success("Kullanıcı engellendi.");
      close();
    },
    onError: (e: unknown) => setError(toProblem(e)),
  });

  const unban = useMutation({
    mutationFn: () => adminMutations.unban(api(), id),
    onSuccess: async () => {
      await refresh();
      toast.success("Kullanıcının engeli kaldırıldı.");
      close();
    },
    onError: (e: unknown) => setError(toProblem(e)),
  });

  const regenerate = useMutation({
    mutationFn: () => adminMutations.regeneratePassword(api(), id),
    onSuccess: async (data) => {
      const current = user.data;
      setRevealed({
        userName: current?.userName ?? "",
        displayName: current ? fullName(current) : "",
        password: data.oneTimePassword,
      });
      await refresh();
      close();
    },
    onError: (e: unknown) => setError(toProblem(e)),
  });

  const setBranchLesson = useMutation({
    mutationFn: (lessonId: number | null) => adminMutations.setBranchLesson(api(), id, lessonId),
    onSuccess: async () => {
      await refresh();
      toast.success("Branş dersi güncellendi.");
      close();
    },
    onError: async (e: unknown) => {
      setError(toProblem(e));
      if (isApiError(e) && e.status === 409) await refresh();
    },
  });

  if (user.isPending) {
    return <div role="status" aria-label="Kullanıcı yükleniyor" className="h-64 animate-pulse rounded-lg bg-surface-muted" />;
  }

  if (user.isError) {
    const notFound = isApiError(user.error) && user.error.status === 404;
    return (
      <EmptyState
        icon={CloudOff}
        as="h2"
        title={notFound ? "Kullanıcı Bulunamadı" : "Kullanıcı Yüklenemedi"}
        description={notFound ? "Bu hesap silinmiş ya da hiç olmamış olabilir." : user.error.message}
        action={
          <Button asChild variant="secondary">
            <Link href="/yonetim/kullanicilar">Listeye Dön</Link>
          </Button>
        }
      />
    );
  }

  const data: AdminUser = user.data;
  const actions = userActions(data, me.data?.id);
  const name = fullName(data) || data.userName;
  const currentBranch = branch ?? (data.branchLessonId === null ? "" : String(data.branchLessonId));

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/yonetim/kullanicilar"
        className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Kullanıcılar
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl" data-testid="user-name">
          {name}
        </h1>
        <RoleBadge role={data.role} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Hesap Bilgileri</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Kullanıcı Adı">
                <span className="font-mono" data-testid="user-username">
                  {data.userName}
                </span>
              </Field>
              <Field label="Ad Soyad">{name}</Field>
              {data.role === "ogrenci" ? <Field label="Sınıf">{data.className ?? "-"}</Field> : null}
              {data.role === "ogretmen" ? <Field label="Branş Dersi">{data.branchLessonName ?? "Atanmamış"}</Field> : null}
              <Field label="Oluşturulma">{formatDateTime(data.createdAt)}</Field>
              <Field label="Son Giriş">{data.lastLoginAt ? formatDateTime(data.lastLoginAt) : "Hiç girmedi"}</Field>
            </dl>
            {data.isBanned ? (
              <p className="text-sm" data-testid="ban-info">
                <span className="font-semibold">Engellenme: </span>
                {data.bannedAt ? formatDateTime(data.bannedAt) : "Tarih kayıtlı değil"}
                {data.bannedBy ? `, engelleyen: ${userLabelOf(data.bannedBy)} (${data.bannedBy.userName})` : ""}
              </p>
            ) : null}
            {data.pendingReportCount > 0 ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="report-info">
                <span>
                  <span className="font-semibold">Bekleyen Şikâyet: </span>
                  {data.pendingReportCount}
                </span>
                <Link href="/ogretmen/sikayetler" className="inline-flex min-h-touch items-center gap-1.5 font-semibold text-primary underline underline-offset-4">
                  <Flag className="size-4" aria-hidden="true" />
                  Şikâyetlere Git
                </Link>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              <UserStatusBadges user={data} />
              {!data.isBanned && !data.mustChangePassword && !data.isSystemAccount ? (
                <span className="text-sm text-muted-foreground">Aktif Hesap</span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">İşlemler</CardTitle>
            <CardDescription>Her işlem onay ister.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul>
              {actions.edit.allowed ? (
                <ActionRow
                  icon={<UserPen className="size-5" aria-hidden="true" />}
                  title="Bilgileri Düzenle"
                  description={data.role === "ogrenci" ? "Ad, soyad ve sınıfı güncelleyebilirsiniz." : "Ad ve soyadı güncelleyebilirsiniz."}
                  label="Bilgileri Düzenle"
                  state={actions.edit}
                  testId="action-edit"
                  onClick={() => setDialog("edit")}
                />
              ) : null}
              {data.isBanned ? (
                <ActionRow
                  icon={<ShieldCheck className="size-5" aria-hidden="true" />}
                  title="Engeli Kaldır"
                  description="Kullanıcı yeniden giriş yapabilir."
                  label="Engeli Kaldır"
                  state={actions.unban}
                  testId="action-unban"
                  onClick={() => setDialog("unban")}
                />
              ) : (
                <ActionRow
                  icon={<Ban className="size-5" aria-hidden="true" />}
                  title="Hesabı Engelle"
                  description="Kullanıcının oturumları kapanır ve giriş yapamaz."
                  label="Engelle"
                  tone="danger"
                  state={actions.ban}
                  testId="action-ban"
                  onClick={() => setDialog("ban")}
                />
              )}
              <ActionRow
                icon={<KeyRound className="size-5" aria-hidden="true" />}
                title="Şifreyi Yenile"
                description="Yeni tek seferlik şifre üretilir, eski şifre ve oturumlar geçersiz olur."
                label="Şifreyi Yenile"
                state={actions.regeneratePassword}
                testId="action-regenerate"
                onClick={() => setDialog("regenerate")}
              />
              {data.role === "ogretmen" ? (
                <ActionRow
                  icon={<BookOpen className="size-5" aria-hidden="true" />}
                  title="Branş Dersi"
                  description={data.branchLessonName ? `Şu an: ${data.branchLessonName}` : "Şu an branş atanmamış."}
                  label="Branşı Değiştir"
                  state={actions.branch}
                  testId="action-branch"
                  onClick={() => {
                    setBranch(null);
                    setDialog("branch");
                  }}
                />
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={dialog === "ban"}
        onOpenChange={(open) => (open ? undefined : close())}
        title="Hesap engellensin mi?"
        description={`${name} giriş yapamayacak ve açık oturumları kapanacak.`}
        confirmLabel="Evet, Engelle"
        tone="danger"
        pending={ban.isPending}
        error={error}
        onConfirm={() => {
          setError(null);
          ban.mutate();
        }}
      />
      <ConfirmDialog
        open={dialog === "unban"}
        onOpenChange={(open) => (open ? undefined : close())}
        title="Engel kaldırılsın mı?"
        description={`${name} yeniden giriş yapabilecek.`}
        confirmLabel="Evet, Kaldır"
        pending={unban.isPending}
        error={error}
        onConfirm={() => {
          setError(null);
          unban.mutate();
        }}
      />
      <ConfirmDialog
        open={dialog === "regenerate"}
        onOpenChange={(open) => (open ? undefined : close())}
        title="Şifre yenilensin mi?"
        description={`${name} için yeni bir tek seferlik şifre üretilecek. Eski şifre çalışmayacak ve kullanıcı yeniden giriş yapacak.`}
        confirmLabel="Evet, Yenile"
        tone="danger"
        pending={regenerate.isPending}
        error={error}
        onConfirm={() => {
          setError(null);
          regenerate.mutate();
        }}
      />
      <ConfirmDialog
        open={dialog === "branch"}
        onOpenChange={(open) => (open ? undefined : close())}
        title="Branş Dersini Değiştir"
        description={`${name} için branş dersini seçin. Mevcut konu planlarına dokunulmaz.`}
        confirmLabel="Kaydet"
        pending={setBranchLesson.isPending}
        error={error}
        onConfirm={() => {
          setError(null);
          setBranchLesson.mutate(currentBranch === "" ? null : Number(currentBranch));
        }}
      >
        <SelectField
          label="Branş Dersi"
          value={currentBranch}
          onChange={(event) => setBranch(event.target.value)}
          disabled={lessons.isPending}
        >
          <option value="">Branş Yok</option>
          {(lessons.data ?? []).map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.name}
            </option>
          ))}
        </SelectField>
      </ConfirmDialog>

      <EditUserDialog user={data} open={dialog === "edit"} onOpenChange={(open) => (open ? setDialog("edit") : close())} />

      <OneTimePasswordDialog result={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}
