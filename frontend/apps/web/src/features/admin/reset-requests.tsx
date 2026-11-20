"use client";

import { formatDateTime, isApiError } from "@lgs/api";
import { adminKeys, adminMutations, passwordResetRequestsQuery, type PasswordResetRequest } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, Inbox, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import type { ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OneTimePasswordDialog } from "@/features/admin/one-time-password-dialog";
import { api } from "@/lib/api/client";
import { fullName } from "@/lib/admin/users";

type Pending = { kind: "complete" | "reject"; request: PasswordResetRequest } | null;

function toProblem(error: unknown): ProblemState {
  if (isApiError(error)) return { status: error.status, problem: error.problem, at: Date.now() };
  return {
    status: 0,
    at: Date.now(),
    problem: { message: "Bağlantı kurulamadı. Tekrar deneyin.", fieldErrors: {}, formError: null, retryAfter: null },
  };
}

export function ResetRequests() {
  const queryClient = useQueryClient();
  const requests = useQuery(passwordResetRequestsQuery(api()));
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<ProblemState | null>(null);
  const [revealed, setRevealed] = useState<{ userName: string; displayName: string; password: string } | null>(null);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.resetRequests() }),
      queryClient.invalidateQueries({ queryKey: adminKeys.users() }),
    ]);
  }

  function close() {
    setPending(null);
    setError(null);
  }

  const complete = useMutation({
    mutationFn: (request: PasswordResetRequest) => adminMutations.completeResetRequest(api(), request.id),
    onSuccess: async (data, request) => {
      setRevealed({ userName: request.userName, displayName: fullName(request), password: data.oneTimePassword });
      await refresh();
      close();
    },
    onError: async (e: unknown) => {
      setError(toProblem(e));
      if (isApiError(e) && e.status === 409) await refresh();
    },
  });

  const reject = useMutation({
    mutationFn: (request: PasswordResetRequest) => adminMutations.rejectResetRequest(api(), request.id),
    onSuccess: async () => {
      await refresh();
      toast.success("Talep reddedildi.");
      close();
    },
    onError: async (e: unknown) => {
      setError(toProblem(e));
      if (isApiError(e) && e.status === 409) await refresh();
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl">Şifre Talepleri</h1>
        <p className="text-muted-foreground">
          Kullanıcıların "şifremi unuttum" talepleri. Onayladığınızda tek seferlik yeni şifre üretilir.
        </p>
      </div>

      {requests.isPending ? (
        <div role="status" aria-label="Talepler yükleniyor" className="grid gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : requests.isError ? (
        <EmptyState
          icon={CloudOff}
          as="h2"
          title="Talepler Yüklenemedi"
          description={requests.error.message}
          action={<Button onClick={() => requests.refetch()}>Tekrar Dene</Button>}
        />
      ) : requests.data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          as="h2"
          title="Bekleyen Talep Yok"
          description="Yeni bir şifre talebi geldiğinde burada ve menüde görünecek."
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3" aria-label="Bekleyen talepler">
          {requests.data.map((request) => (
            <li key={request.id}>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <div>
                    <p className="text-lg font-semibold" data-testid="request-name">
                      {fullName(request) || request.userName}
                    </p>
                    <p className="font-mono text-sm text-muted-foreground">{request.userName}</p>
                    <p className="text-sm text-muted-foreground">
                      {request.className ? `${request.className} · ` : ""}
                      {formatDateTime(request.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setPending({ kind: "complete", request });
                      }}
                      aria-label={`${request.userName} talebini onayla`}
                    >
                      <CheckCircle2 aria-hidden="true" />
                      Onayla
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setError(null);
                        setPending({ kind: "reject", request });
                      }}
                      aria-label={`${request.userName} talebini reddet`}
                    >
                      <XCircle aria-hidden="true" />
                      Reddet
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pending?.kind === "complete"}
        onOpenChange={(open) => (open ? undefined : close())}
        title="Talep onaylansın mı?"
        description={`${pending ? fullName(pending.request) : ""} için tek seferlik yeni şifre üretilecek. Eski şifre çalışmayacak.`}
        confirmLabel="Onayla ve Şifre Üret"
        pending={complete.isPending}
        error={error}
        onConfirm={() => {
          if (!pending) return;
          setError(null);
          complete.mutate(pending.request);
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "reject"}
        onOpenChange={(open) => (open ? undefined : close())}
        title="Talep reddedilsin mi?"
        description={`${pending ? fullName(pending.request) : ""} için şifre yenilenmeyecek.`}
        confirmLabel="Reddet"
        tone="danger"
        pending={reject.isPending}
        error={error}
        onConfirm={() => {
          if (!pending) return;
          setError(null);
          reject.mutate(pending.request);
        }}
      />
      <OneTimePasswordDialog result={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}
