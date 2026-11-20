"use client";

import { maintenanceMutations, type FileCleanupResult } from "@lgs/api/queries";
import { useMutation } from "@tanstack/react-query";
import { Eraser } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ProblemBanner, useCountdown, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toProblemState } from "@/features/student/comment-node";
import { api } from "@/lib/api/client";

export function cleanupSummary(result: FileCleanupResult): string {
  const total = result.pendingDeleted + result.unusedDeleted;
  if (total === 0) return "Temizlenecek sahipsiz dosya bulunmadı.";
  return `${total} dosya silindi: ${result.pendingDeleted} tamamlanmamış yükleme, ${result.unusedDeleted} kullanılmayan dosya.`;
}

export function MaintenanceCard() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ProblemState | null>(null);
  const [result, setResult] = useState<FileCleanupResult | null>(null);
  const countdown = useCountdown(error?.status === 429 ? error.problem.retryAfter : null, error?.at);

  const mutation = useMutation({
    mutationFn: () => maintenanceMutations.cleanupFiles(api()),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      setOpen(false);
    },
    onError: (failure: unknown) => {
      const state = toProblemState(failure);
      setError(state);
      if (state.status === 429) setOpen(false);
    },
  });

  return (
    <Card data-testid="maintenance-card">
      <CardHeader>
        <CardTitle as="h2">Bakım</CardTitle>
        <CardDescription>Yükleme sırasında yarım kalan ve hiçbir kayda bağlı olmayan dosyaları siler.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {result ? (
          <p role="status" data-testid="cleanup-result" className="text-sm font-semibold">
            {cleanupSummary(result)}
          </p>
        ) : null}
        {!open && error ? <ProblemBanner state={error} countdown={countdown} conflictAsMessage /> : null}
        <div>
          <Button
            type="button"
            variant="secondary"
            data-testid="cleanup-open"
            disabled={countdown > 0}
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            <Eraser className="size-4" aria-hidden="true" />
            {countdown > 0 ? `Bekle (${countdown})` : "Sahipsiz Dosyaları Temizle"}
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sahipsiz dosyalar temizlensin mi?"
        description="Tamamlanmamış yüklemeler ve hiçbir kayda bağlı olmayan dosyalar kalıcı olarak silinir. Bu işlem geri alınamaz."
        confirmLabel="Temizle"
        tone="danger"
        conflictAsMessage
        pending={mutation.isPending}
        error={error}
        onConfirm={() => mutation.mutate()}
      />
    </Card>
  );
}
