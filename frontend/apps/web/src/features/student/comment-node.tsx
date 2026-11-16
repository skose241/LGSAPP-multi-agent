"use client";

import { formatDateTimeShort, isApiError } from "@lgs/api";
import { commentKeys, commentMutations, questionKeys, solutionKeys, type Comment } from "@lgs/api/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CornerDownRight, Flag, Pencil, Reply, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportDialog } from "@/features/student/report-dialog";
import { api } from "@/lib/api/client";
import { clearDraft, loadDraft, saveDraft } from "@/lib/session/draft";

export interface CommentContext {
  questionId: number;
  solutionId: number | null;
  canComment: boolean;
  maxLength: number;
  reportMinLength: number;
}

export function toProblemState(error: unknown): ProblemState {
  if (isApiError(error)) return { status: error.status, problem: error.problem, at: Date.now() };
  return {
    status: 0,
    at: Date.now(),
    problem: { message: "Bağlantı kurulamadı. Tekrar dene.", fieldErrors: {}, formError: null, retryAfter: null },
  };
}

export function useInvalidateDiscussion(questionId: number) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: commentKeys.all }),
      queryClient.invalidateQueries({ queryKey: questionKeys.detail(questionId) }),
      queryClient.invalidateQueries({ queryKey: solutionKeys.list(questionId) }),
    ]);
  };
}

function useSecondsUntil(iso: string | null): number {
  const target = iso ? Date.parse(iso) : Number.NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (Number.isNaN(target) || target <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [target]);
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CommentForm({
  ctx,
  parentId,
  draftKey,
  onDone,
  autoFocus = false,
  placeholder = "Yorumunu yaz",
  submitLabel = "Yorum yap",
}: {
  ctx: CommentContext;
  parentId: number | null;
  draftKey: string;
  onDone?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  submitLabel?: string;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<ProblemState | null>(null);
  const invalidate = useInvalidateDiscussion(ctx.questionId);
  const counterId = useId();

  useEffect(() => {
    setText(loadDraft(draftKey));
  }, [draftKey]);

  const mutation = useMutation({
    mutationFn: () => commentMutations.create(api(), ctx.questionId, text.trim(), parentId, ctx.solutionId),
    onSuccess: async () => {
      clearDraft(draftKey);
      setText("");
      setError(null);
      await invalidate();
      onDone?.();
    },
    onError: (e: unknown) => setError(toProblemState(e)),
  });

  const length = text.trim().length;
  const over = length > ctx.maxLength;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (length > 0 && !over) mutation.mutate();
      }}
    >
      <ProblemBanner state={error} conflictAsMessage />
      <textarea
        aria-label={parentId ? "Yanıt metni" : "Yorum metni"}
        aria-describedby={counterId}
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          saveDraft(draftKey, event.target.value);
        }}
        className="min-h-24 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-base hover:border-neutral-600 focus-visible:border-primary aria-invalid:border-danger"
        aria-invalid={over || undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={counterId} className={over ? "text-xs font-semibold text-danger" : "text-xs text-muted-foreground"} data-testid="comment-counter">
          {length} / {ctx.maxLength}
        </p>
        <div className="flex gap-2">
          {onDone ? (
            <Button type="button" variant="ghost" onClick={onDone}>
              Vazgeç
            </Button>
          ) : null}
          <Button type="submit" disabled={length === 0 || over} loading={mutation.isPending}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function EditForm({ comment, ctx, onDone }: { comment: Comment; ctx: CommentContext; onDone: () => void }) {
  const [text, setText] = useState(comment.body ?? "");
  const [error, setError] = useState<ProblemState | null>(null);
  const invalidate = useInvalidateDiscussion(ctx.questionId);

  const mutation = useMutation({
    mutationFn: () => commentMutations.edit(api(), comment.id, text.trim(), comment.rowVersion ?? ""),
    onSuccess: async () => {
      toast.success("Yorum güncellendi.");
      await invalidate();
      onDone();
    },
    onError: async (e: unknown) => {
      setError(toProblemState(e));
      if (isApiError(e) && e.status === 409) await invalidate();
    },
  });

  const length = text.trim().length;
  return (
    <div className="flex flex-col gap-2">
      <ProblemBanner state={error} />
      <textarea
        aria-label="Yorumu düzenle"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="min-h-24 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-base focus-visible:border-primary"
      />
      <div className="flex items-center justify-between gap-2">
        <p className={length > ctx.maxLength ? "text-xs font-semibold text-danger" : "text-xs text-muted-foreground"}>
          {length} / {ctx.maxLength}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Vazgeç
          </Button>
          <Button type="button" disabled={length === 0 || length > ctx.maxLength} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CommentNode({ comment, ctx, depth = 0 }: { comment: Comment; ctx: CommentContext; depth?: number }) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [deleteError, setDeleteError] = useState<ProblemState | null>(null);
  const invalidate = useInvalidateDiscussion(ctx.questionId);
  const remaining = useSecondsUntil(comment.editableUntil);

  const removal = useMutation({
    mutationFn: () => commentMutations.remove(api(), comment.id),
    onSuccess: async () => {
      setConfirmDelete(false);
      toast.success("Yorum silindi.");
      await invalidate();
    },
    onError: async (e: unknown) => {
      setDeleteError(toProblemState(e));
      if (isApiError(e) && e.status === 409) await invalidate();
    },
  });

  const gone = comment.status !== "active";
  const level = Math.min(depth, 3);
  const canEdit = comment.canEdit && !gone && (comment.editableUntil === null || remaining > 0);

  return (
    <li
      data-testid="comment"
      data-comment-id={comment.id}
      style={{ "--level": level } as React.CSSProperties}
      className="ml-[calc(var(--level)*0.75rem)] flex flex-col gap-2 md:ml-[calc(var(--level)*1.5rem)]"
    >
      <article className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3" aria-label={gone ? "Silinmiş yorum" : `${comment.author?.userName ?? "Kullanıcı"} yorumu`}>
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold" data-testid="comment-author">
            {gone ? "[silindi]" : (comment.author?.fullName || comment.author?.userName || "Kullanıcı")}
          </span>
          {!gone && comment.author?.role && comment.author.role !== "ogrenci" ? (
            <Badge tone={comment.author.role === "ogretmen" ? "accent" : "neutral"}>
              {comment.author.role === "ogretmen" ? "Öğretmen" : comment.author.role === "ai" ? "Yapay zekâ" : "Müdür"}
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">{formatDateTimeShort(comment.createdAt)}</span>
          {comment.editedAt && !gone ? <span className="text-xs text-muted-foreground">(düzenlendi)</span> : null}
        </header>

        {editing ? (
          <EditForm comment={comment} ctx={ctx} onDone={() => setEditing(false)} />
        ) : gone ? (
          <p className="text-sm italic text-muted-foreground" data-testid="comment-body">
            [silindi]
          </p>
        ) : (
          <p className="max-w-prose whitespace-pre-wrap break-words text-base" data-testid="comment-body">
            {comment.replyToUserName ? <span className="font-semibold text-primary-soft-foreground">@{comment.replyToUserName} </span> : null}
            {comment.body}
          </p>
        )}

        {!gone && !editing ? (
          <div className="flex flex-wrap items-center gap-1">
            {ctx.canComment ? (
              <Button type="button" variant="ghost" className="h-11 px-3" onClick={() => setReplying((value) => !value)}>
                <Reply aria-hidden="true" />
                Yanıtla
              </Button>
            ) : null}
            {canEdit ? (
              <Button type="button" variant="ghost" className="h-11 px-3" onClick={() => setEditing(true)}>
                <Pencil aria-hidden="true" />
                Düzenle
                {comment.editableUntil && remaining > 0 ? <span className="text-xs text-muted-foreground">({formatRemaining(remaining)})</span> : null}
              </Button>
            ) : null}
            {comment.canDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11 px-3 text-danger"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmDelete(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                Sil
              </Button>
            ) : null}
            {comment.canReport ? (
              <Button type="button" variant="ghost" className="h-11 px-3" onClick={() => setReporting(true)}>
                <Flag aria-hidden="true" />
                Şikâyet et
              </Button>
            ) : null}
          </div>
        ) : null}

        {replying ? (
          <CommentForm
            ctx={ctx}
            parentId={comment.id}
            draftKey={`yanit:${ctx.questionId}:${comment.id}`}
            autoFocus
            placeholder="Yanıtını yaz"
            submitLabel="Yanıtla"
            onDone={() => setReplying(false)}
          />
        ) : null}
      </article>

      {comment.replies.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Yanıtlar">
          {comment.replies.map((reply) => (
            <CommentNode key={reply.id} comment={reply} ctx={ctx} depth={depth + 1} />
          ))}
        </ul>
      ) : null}

      {comment.hasMoreReplies ? (
        <Link
          href={`/yorumlar/${comment.id}`}
          className="ml-3 inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4"
        >
          <CornerDownRight className="size-4" aria-hidden="true" />
          Devamını göster ({comment.hiddenReplyCount} yanıt)
        </Link>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Yorum silinsin mi?"
        description="Yorumun yerinde [silindi] yazacak. Bu işlem geri alınamaz."
        confirmLabel="Evet, sil"
        tone="danger"
        pending={removal.isPending}
        error={deleteError}
        onConfirm={() => {
          setDeleteError(null);
          removal.mutate();
        }}
      />
      <ReportDialog
        open={reporting}
        onOpenChange={setReporting}
        target="comment"
        minLength={ctx.reportMinLength}
        submit={(reason, description) => commentMutations.report(api(), comment.id, reason, description)}
      />
    </li>
  );
}
