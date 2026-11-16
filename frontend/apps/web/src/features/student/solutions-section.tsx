"use client";

import { editLockedMessage, formatDateTimeShort, isApiError, solutionTypeLabel } from "@lgs/api";
import { solutionKeys, solutionMutations, solutionsQuery, questionKeys, type Solution } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CloudOff, Flag, GraduationCap, MessageSquare, Pencil, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { MathText } from "@/components/math-text";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CommentSection } from "@/features/student/comment-section";
import { toProblemState } from "@/features/student/comment-node";
import { ReportDialog } from "@/features/student/report-dialog";
import { usePublicSettings } from "@/features/student/use-settings";
import { PhotoAttachment } from "@/features/upload/photo-attachment";
import { usePhotoAttachment } from "@/features/upload/use-photo-attachment";
import { api } from "@/lib/api/client";
import { solutionTextState } from "@/lib/student/upload-rules";

function TypeBadge({ type }: { type: string }) {
  const Icon = type === "teacher" ? GraduationCap : type === "ai" ? Bot : UserRound;
  return (
    <Badge tone={type === "teacher" ? "accent" : type === "ai" ? "info" : "primary"}>
      <Icon aria-hidden="true" />
      {solutionTypeLabel(type)}
    </Badge>
  );
}

function EditSolution({ solution, questionId, onDone }: { solution: Solution; questionId: number; onDone: () => void }) {
  const settings = usePublicSettings();
  const queryClient = useQueryClient();
  const [text, setText] = useState(solution.text ?? "");
  const [error, setError] = useState<ProblemState | null>(null);
  const min = settings.data?.aciklamaMinKarakter ?? 20;
  const max = settings.data?.cozumMaxKarakter ?? 2000;
  const length = text.trim().length;
  const photo = usePhotoAttachment(solution.image);
  const { valid, tooShort, tooLong } = solutionTextState({ length, min, max, hasPhoto: photo.fileId !== null });

  const mutation = useMutation({
    mutationFn: () => solutionMutations.update(api(), solution.id, text.trim() === "" ? null : text.trim(), photo.fileId, solution.rowVersion ?? ""),
    onSuccess: async () => {
      toast.success("Çözümün güncellendi.");
      await queryClient.invalidateQueries({ queryKey: solutionKeys.list(questionId) });
      await queryClient.invalidateQueries({ queryKey: questionKeys.detail(questionId) });
      onDone();
    },
    onError: async (e: unknown) => {
      setError(toProblemState(e));
      if (isApiError(e) && e.status === 409) {
        await queryClient.invalidateQueries({ queryKey: solutionKeys.list(questionId) });
      }
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <ProblemBanner state={error} conflictAsMessage />
      <textarea
        aria-label="Çözümü düzenle"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="min-h-32 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-base focus-visible:border-primary"
      />
      <p className={tooShort || tooLong ? "text-xs font-semibold text-warning-soft-foreground" : "text-xs text-muted-foreground"} data-testid="edit-counter">
        {photo.fileId !== null ? `${length} / en fazla ${max} karakter (fotoğraf olduğu için yazı isteğe bağlı)` : `${length} / en az ${min}, en fazla ${max} karakter`}
      </p>
      <PhotoAttachment controller={photo} label="Çözüm fotoğrafı" disabled={mutation.isPending} />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            photo.discardUnsaved();
            onDone();
          }}
        >
          Vazgeç
        </Button>
        <Button type="button" disabled={!valid || photo.busy} loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Kaydet
        </Button>
      </div>
    </div>
  );
}

function SolutionCard({ solution, questionId, minReport }: { solution: Solution; questionId: number; minReport: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [reporting, setReporting] = useState(false);
  const locked = editLockedMessage(solution.editLockedReason);
  const authorName = solution.author?.fullName || solution.author?.userName || "Kullanıcı";

  return (
    <li data-testid="solution" data-solution-id={solution.id}>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <header className="flex flex-wrap items-center gap-2 text-sm">
            <TypeBadge type={solution.type} />
            <span className="font-semibold" data-testid="solution-author">
              {authorName}
              {solution.isMine ? " (Sen)" : ""}
            </span>
            <span className="text-xs text-muted-foreground">{formatDateTimeShort(solution.createdAt)}</span>
            {solution.updatedAt ? <span className="text-xs text-muted-foreground" data-testid="solution-edited">(düzenlendi)</span> : null}
          </header>

          {editing ? (
            <EditSolution solution={solution} questionId={questionId} onDone={() => setEditing(false)} />
          ) : (
            <>
              {solution.text ? <MathText text={solution.text} className="max-w-prose text-base" /> : null}
              {solution.image ? (
                <QuestionImage
                  image={solution.image}
                  alt="Çözüm görseli"
                  variant="full"
                  zoomable
                  onExpired={() => queryClient.invalidateQueries({ queryKey: solutionKeys.list(questionId) })}
                />
              ) : null}
            </>
          )}

          {solution.isMine && !editing ? (
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="secondary"
                className="self-start"
                disabled={!solution.canEdit}
                aria-describedby={locked ? `locked-${solution.id}` : undefined}
                data-testid="solution-edit"
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden="true" />
                Düzenle
              </Button>
              {locked ? (
                <p id={`locked-${solution.id}`} className="text-sm font-medium text-warning-soft-foreground" data-testid="solution-locked">
                  {locked}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1 border-t border-border pt-2">
            <Button type="button" variant="ghost" className="h-11 px-3" aria-expanded={showComments} onClick={() => setShowComments((value) => !value)}>
              <MessageSquare aria-hidden="true" />
              Yorumlar ({solution.commentCount})
            </Button>
            {!solution.isMine ? (
              <Button type="button" variant="ghost" className="h-11 px-3" onClick={() => setReporting(true)}>
                <Flag aria-hidden="true" />
                Şikâyet et
              </Button>
            ) : null}
          </div>

          {showComments ? <CommentSection questionId={questionId} solutionId={solution.id} label="Çözüm yorumları" /> : null}
        </CardContent>
      </Card>
      <ReportDialog
        open={reporting}
        onOpenChange={setReporting}
        target="solution"
        minLength={minReport}
        submit={(reason, description) => solutionMutations.report(api(), solution.id, reason, description)}
      />
    </li>
  );
}

export function SolutionsSection({ questionId, aiSlot }: { questionId: number; aiSlot?: (aiSolution: Solution | undefined) => ReactNode }) {
  const solutions = useQuery(solutionsQuery(api(), questionId));
  const settings = usePublicSettings();
  const items = solutions.data?.items ?? [];
  const aiSolution = items.find((item) => item.type === "ai");
  const others = items.filter((item) => item.type !== "ai");
  const ordered = [...others, ...(aiSolution ? [aiSolution] : [])];

  return (
    <section aria-label="Çözümler" className="flex flex-col gap-3">
      <h2 className="text-xl">Çözümler</h2>
      {aiSlot ? aiSlot(aiSolution) : null}
      {solutions.isPending ? (
        <div role="status" aria-label="Çözümler yükleniyor" className="h-24 animate-pulse rounded-md bg-surface-muted" />
      ) : solutions.isError ? (
        <EmptyState
          icon={CloudOff}
          as="h3"
          title="Çözümler yüklenemedi"
          description={solutions.error.message}
          action={<Button onClick={() => solutions.refetch()}>Tekrar Dene</Button>}
        />
      ) : ordered.length === 0 ? (
        <EmptyState icon={MessageSquare} as="h3" title="Henüz çözüm yok" description="Çözümler burada görünecek." />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Çözüm listesi">
          {ordered.map((solution) => (
            <SolutionCard key={solution.id} solution={solution} questionId={questionId} minReport={settings.data?.sikayetMinKarakter ?? 10} />
          ))}
        </ul>
      )}
    </section>
  );
}
