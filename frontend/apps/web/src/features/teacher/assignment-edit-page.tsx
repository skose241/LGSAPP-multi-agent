"use client";

import { formatDateOnly, isApiError, todayInIstanbul } from "@lgs/api";
import { assignmentDetailQuery, assignmentKeys, assignmentMutations, type AssignmentManageDetail } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, CloudOff, Eye, EyeOff, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toProblemState } from "@/features/student/comment-node";
import { AssignmentAddPanels } from "@/features/teacher/assignment-add-panels";
import { AssignmentFields } from "@/features/teacher/assignment-fields";
import { useBeforeUnload } from "@/features/upload/hooks";
import { DIRTY_LEAVE_MESSAGE } from "@/lib/upload/leave-guard";
import { AssignmentQuestionsSection } from "@/features/teacher/assignment-questions";
import { api } from "@/lib/api/client";
import {
  datesEditable,
  formatPublishNote,
  questionsEditable,
  remainingLabel,
  stateLabel,
  stateTone,
  bindServerFormProblem,
  validateAssignmentDates,
  type AssignmentFormValues,
} from "@/lib/teacher/assignments";

interface DetailsFormProps {
  detail: AssignmentManageDetail;
  today: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => Promise<void>;
  onFailure: (error: unknown) => Promise<void>;
}

function DetailsForm({ detail, today, onDirtyChange, onSaved, onFailure }: DetailsFormProps) {
  const initial: AssignmentFormValues = {
    title: detail.title,
    description: detail.description ?? "",
    startDate: detail.startDate,
    endDate: detail.endDate,
  };
  const [values, setValues] = useState<AssignmentFormValues>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<ProblemState | null>(null);
  const editable = datesEditable(detail.canModify, detail.state);
  const textEditable = detail.canModify && detail.state !== "closed";
  const dirty =
    values.title !== initial.title || values.description !== initial.description || values.startDate !== initial.startDate || values.endDate !== initial.endDate;
  const dateOptions = { today, allowPastStart: values.startDate === initial.startDate };
  const dateErrors = showErrors ? validateAssignmentDates(values, dateOptions) : {};

  useEffect(() => {
    onDirtyChange(false);
    return () => onDirtyChange(false);
  }, []);

  function change(patch: Partial<AssignmentFormValues>) {
    const next = { ...values, ...patch };
    setValues(next);
    onDirtyChange(
      next.title !== initial.title || next.description !== initial.description || next.startDate !== initial.startDate || next.endDate !== initial.endDate,
    );
  }

  const save = useMutation({
    mutationFn: () =>
      assignmentMutations.update(api(), detail.id, {
        title: values.title.trim(),
        description: values.description.trim(),
        startDate: values.startDate,
        endDate: values.endDate,
        rowVersion: detail.rowVersion,
      }),
    onSuccess: async () => {
      setError(null);
      onDirtyChange(false);
      toast.success("Ödev bilgileri kaydedildi.");
      await onSaved();
    },
    onError: async (e: unknown) => {
      if (isApiError(e) && (e.status === 409 || e.status === 404)) {
        await onFailure(e);
        return;
      }
      setError(toProblemState(e));
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    setError(null);
    if (Object.keys(validateAssignmentDates(values, dateOptions)).length > 0) return;
    save.mutate();
  }

  const fieldProblem = error && error.status === 400 ? error.problem : null;
  const serverErrors = fieldProblem ? bindServerFormProblem(fieldProblem, values, today) : null;
  const bannerState = error && (error.status !== 400 || (Object.keys(error.problem.fieldErrors).length === 0 && !serverErrors)) ? error : null;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Ödev bilgileri</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ProblemBanner state={bannerState} conflictAsMessage />
          <AssignmentFields
            values={values}
            onChange={change}
            errors={{ ...serverErrors, ...dateErrors }}
            problem={fieldProblem}
            minDate={today}
            textDisabled={!textEditable || save.isPending}
            startDisabled={!editable.start || save.isPending}
            endDisabled={!editable.end || save.isPending}
            startHint={detail.state === "open" ? "Başlamış ödevin başlangıç tarihi değiştirilemez." : undefined}
          />
          {textEditable ? (
            <div className="flex justify-end">
              <Button type="submit" loading={save.isPending} disabled={!dirty} data-testid="assignment-save">
                Değişiklikleri kaydet
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </form>
  );
}

export function AssignmentEditPage({ id }: { id: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const detail = useQuery(assignmentDetailQuery(api(), id));
  const today = todayInIstanbul();
  const [band, setBand] = useState<ProblemState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [discarded, setDiscarded] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dialogError, setDialogError] = useState<ProblemState | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useBeforeUnload(dirty, DIRTY_LEAVE_MESSAGE);

  const refresh = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: assignmentKeys.detail(id) }), queryClient.invalidateQueries({ queryKey: assignmentKeys.teacherAll })]);
  };

  const onFailure = async (error: unknown) => {
    setBand(toProblemState(error));
    setPublishOpen(false);
    setUnpublishOpen(false);
    setDeleteOpen(false);
    if (isApiError(error) && (error.status === 409 || error.status === 404)) await refresh();
  };

  const onChanged = async () => {
    setBand(null);
    await refresh();
  };

  function rememberOpener(opener: HTMLElement) {
    openerRef.current = opener;
    setDialogError(null);
  }

  function restoreFocus(event: Event) {
    event.preventDefault();
    const opener = openerRef.current;
    if (opener && opener.isConnected && !(opener instanceof HTMLButtonElement && opener.disabled)) opener.focus();
    else headingRef.current?.focus();
  }

  const publish = useMutation({
    mutationFn: (rowVersion: string) => assignmentMutations.publish(api(), id, rowVersion),
    onSuccess: async (change) => {
      setPublishOpen(false);
      setDialogError(null);
      setBand(null);
      toast.success(formatPublishNote(change));
      await refresh();
    },
    onError: async (e: unknown) => {
      const state = toProblemState(e);
      if (state.status === 409) {
        setDialogError(state);
        await refresh();
        return;
      }
      setDialogError(state);
    },
  });

  const unpublish = useMutation({
    mutationFn: (rowVersion: string) => assignmentMutations.unpublish(api(), id, rowVersion),
    onSuccess: async () => {
      setUnpublishOpen(false);
      setDialogError(null);
      setBand(null);
      toast.success("Ödev yayından kaldırıldı ve taslağa döndü.");
      await refresh();
    },
    onError: async (e: unknown) => {
      setDialogError(toProblemState(e));
      if (isApiError(e) && e.status === 409) await refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (rowVersion: string) => assignmentMutations.remove(api(), id, rowVersion),
    onSuccess: async () => {
      setDeleteOpen(false);
      toast.success("Ödev silindi.");
      queryClient.removeQueries({ queryKey: assignmentKeys.detail(id) });
      await queryClient.invalidateQueries({ queryKey: assignmentKeys.teacherAll });
      router.replace("/ogretmen/odevler");
    },
    onError: async (e: unknown) => {
      setDialogError(toProblemState(e));
      if (isApiError(e) && e.status === 409) await refresh();
    },
  });

  const back = (
    <Link href="/ogretmen/odevler" className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Ödev yönetimi
    </Link>
  );

  if (detail.isPending) {
    return <div role="status" aria-label="Ödev yükleniyor" className="h-96 animate-pulse rounded-lg bg-surface-muted" />;
  }

  if (detail.isError) {
    const missing = isApiError(detail.error) && (detail.error.status === 404 || detail.error.status === 403);
    return (
      <div className="flex flex-col gap-4">
        {back}
        <EmptyState
          icon={CloudOff}
          as="h2"
          title={missing ? "Ödev bulunamadı" : "Ödev yüklenemedi"}
          description={missing ? "Ödev silinmiş olabilir ya da bu ödeve erişimin yok." : detail.error.message}
          action={missing ? undefined : <Button onClick={() => detail.refetch()}>Tekrar Dene</Button>}
        />
      </div>
    );
  }

  const data = detail.data;
  const canQuestions = questionsEditable(data.canModify, data.state);
  const hasResults = data.state === "open" || data.state === "closed";
  const countable = data.questions.filter((question) => !question.isHidden).length;
  const startsPast = data.startDate < today;
  const startsToday = data.startDate === today;

  return (
    <div className="flex flex-col gap-5">
      {back}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{data.lesson.name}</Badge>
          <Badge tone={stateTone(data.state)} data-testid="assignment-state">
            {stateLabel(data.state)}
          </Badge>
          <Badge tone="neutral">{remainingLabel(data.state, data.startDate, data.endDate, today)}</Badge>
          {!data.canModify ? <Badge tone="warning">Salt okunur</Badge> : null}
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl outline-none" data-testid="assignment-title">
          {data.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.teacher.fullName || data.teacher.userName} · {formatDateOnly(data.startDate)} – {formatDateOnly(data.endDate)} · {data.participantCount} öğrenci katıldı
        </p>
      </div>

      <ProblemBanner state={band} conflictAsMessage />

      {data.canModify ? (
        <div className="flex flex-wrap gap-2" data-testid="assignment-actions">
          {data.state === "draft" ? (
            <Button
              type="button"
              disabled={dirty || countable === 0 || startsPast}
              onClick={(event) => {
                rememberOpener(event.currentTarget);
                setPublishOpen(true);
              }}
              data-testid="assignment-publish"
            >
              <Send aria-hidden="true" />
              Yayınla
            </Button>
          ) : null}
          {data.state === "scheduled" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={(event) => {
                rememberOpener(event.currentTarget);
                setUnpublishOpen(true);
              }}
              data-testid="assignment-unpublish"
            >
              <EyeOff aria-hidden="true" />
              Yayından kaldır
            </Button>
          ) : null}
          {hasResults ? (
            <Button asChild variant="secondary">
              <Link href={`/ogretmen/odevler/${data.id}/sonuclar`}>
                <BarChart3 aria-hidden="true" />
                Sonuçlar
              </Link>
            </Button>
          ) : null}
          {data.state === "draft" || data.state === "scheduled" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={(event) => {
                rememberOpener(event.currentTarget);
                setDeleteOpen(true);
              }}
              data-testid="assignment-delete"
            >
              <Trash2 aria-hidden="true" />
              Ödevi sil
            </Button>
          ) : null}
        </div>
      ) : hasResults ? (
        <Button asChild variant="secondary" className="self-start">
          <Link href={`/ogretmen/odevler/${data.id}/sonuclar`}>
            <Eye aria-hidden="true" />
            Sonuçları gör
          </Link>
        </Button>
      ) : null}
      {data.state === "draft" && data.canModify && (dirty || countable === 0 || startsPast) ? (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground" data-testid="publish-hint">
          {dirty ? <li>Yayınlamadan önce ödev bilgilerindeki değişiklikleri kaydet.</li> : null}
          {startsPast ? (
            <li data-testid="publish-past-start">Başlangıç tarihi ({formatDateOnly(data.startDate)}) geçmişte kaldı. Yayınlamak için başlangıç tarihini bugün ya da sonraki bir güne güncelle.</li>
          ) : null}
          {countable === 0 ? <li>Yayınlamak için ödeve en az bir soru ekle.</li> : null}
        </ul>
      ) : null}
      {discarded > 0 && !canQuestions ? (
        <p role="status" data-testid="discarded-cards" className="rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground">
          Ödevin durumu değiştiği için soru ekleme alanı kapandı. Gönderilmemiş {discarded} fotoğraf kartı kaldırıldı ve yüklenen kullanılmamış fotoğraflar silindi. Gerekirse ödevi taslağa alıp fotoğrafları yeniden ekle.
        </p>
      ) : null}

      <DetailsForm key={data.rowVersion} detail={data} today={today} onDirtyChange={setDirty} onSaved={onChanged} onFailure={onFailure} />

      <AssignmentQuestionsSection detail={data} editable={canQuestions} onFailure={onFailure} onChanged={onChanged} onImageExpired={() => void refresh()} />

      {canQuestions ? <AssignmentAddPanels detail={data} onChanged={onChanged} onFailure={onFailure} onDiscard={(count) => setDiscarded(count)} /> : null}

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Ödev yayınlansın mı?"
        description={
          startsToday
            ? "Başlangıç tarihi bugün olduğu için ödev hemen öğrencilere açılır ve bildirim gider."
            : `Ödev ${formatDateOnly(data.startDate)} tarihinde öğrencilere açılacak. O zamana kadar planlı kalır ve yayından kaldırabilirsin.`
        }
        confirmLabel="Yayınla"
        pending={publish.isPending}
        error={dialogError}
        conflictAsMessage
        onCloseAutoFocus={restoreFocus}
        onConfirm={() => publish.mutate(data.rowVersion)}
      />
      <ConfirmDialog
        open={unpublishOpen}
        onOpenChange={setUnpublishOpen}
        title="Yayından kaldırılsın mı?"
        description="Ödev taslağa döner ve öğrenciler göremez. İstediğin zaman yeniden yayınlayabilirsin."
        confirmLabel="Yayından kaldır"
        pending={unpublish.isPending}
        error={dialogError}
        conflictAsMessage
        onCloseAutoFocus={restoreFocus}
        onConfirm={() => unpublish.mutate(data.rowVersion)}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Ödev silinsin mi?"
        description="Ödev silinir. Ödev için oluşturulan sorular kaldırılır, havuzdan eklenenler havuza geri döner. Bu işlem geri alınamaz."
        confirmLabel="Ödevi sil"
        tone="danger"
        pending={remove.isPending}
        error={dialogError}
        conflictAsMessage
        onCloseAutoFocus={restoreFocus}
        onConfirm={() => remove.mutate(data.rowVersion)}
      />
    </div>
  );
}
