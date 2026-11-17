"use client";

import { fieldError, isApiError } from "@lgs/api";
import { questionKeys, solutionKeys, solutionsQuery, teacherKeys, teacherMutations, type QuestionDetail } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, PenLine } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toProblemState } from "@/features/student/comment-node";
import { usePublicSettings } from "@/features/student/use-settings";
import { PhotoAttachment } from "@/features/upload/photo-attachment";
import { usePhotoAttachment } from "@/features/upload/use-photo-attachment";
import { api } from "@/lib/api/client";
import { clearDraft, loadDraft, saveDraft } from "@/lib/session/draft";
import { teacherSolutionState } from "@/lib/teacher/solution";

const OPEN_PARAM = "cozum";
const OPEN_VALUE = "ogretmen";

function TeacherSolutionForm({ questionId, onDone, onConflict }: { questionId: number; onDone: () => void; onConflict: (state: ProblemState) => void }) {
  const queryClient = useQueryClient();
  const settings = usePublicSettings();
  const draftKey = `ogretmen-cozum:${questionId}`;
  const [text, setText] = useState("");
  const [error, setError] = useState<ProblemState | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [textError, setTextError] = useState<string | undefined>(undefined);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const photo = usePhotoAttachment(null);
  const max = settings.data?.cozumMaxKarakter ?? 2000;
  const length = text.trim().length;
  const { valid, tooLong } = teacherSolutionState({ length, max, hasPhoto: photo.fileId !== null });

  useEffect(() => {
    setText(loadDraft(draftKey));
    areaRef.current?.focus();
    areaRef.current?.scrollIntoView({ block: "center" });
  }, [draftKey]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: solutionKeys.list(questionId) }),
      queryClient.invalidateQueries({ queryKey: questionKeys.detail(questionId) }),
      queryClient.invalidateQueries({ queryKey: teacherKeys.needsAll }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };

  const mutation = useMutation({
    mutationFn: () => teacherMutations.createTeacherSolution(api(), questionId, text.trim() === "" ? null : text.trim(), photo.fileId),
    onSuccess: async () => {
      clearDraft(draftKey);
      toast.success("Öğretmen çözümü eklendi.");
      await refresh();
      onDone();
    },
    onError: async (e: unknown) => {
      const state = toProblemState(e);
      setTextError(fieldError(state.problem, "text"));
      if (isApiError(e) && (e.status === 409 || e.status === 404)) {
        clearDraft(draftKey);
        onConflict(state);
        await refresh();
        return;
      }
      setError(state);
    },
  });

  const discard = () => {
    clearDraft(draftKey);
    photo.discardUnsaved();
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-4"
      aria-label="Öğretmen çözümü ekle"
      data-testid="teacher-solution-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setTextError(undefined);
        if (valid && !photo.busy) mutation.mutate();
      }}
    >
      <ProblemBanner state={error} conflictAsMessage />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${fieldId}-text`} className="text-sm font-semibold">
          Çözüm metni
        </label>
        <textarea
          ref={areaRef}
          id={`${fieldId}-text`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            saveDraft(draftKey, event.target.value);
          }}
          aria-describedby={`${fieldId}-hint`}
          aria-invalid={Boolean(textError) || tooLong || undefined}
          placeholder="Çözümü adım adım anlat. Matematik için $x^2$ biçimini kullanabilirsin."
          className="min-h-40 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-base hover:border-neutral-600 focus-visible:border-primary aria-invalid:border-danger aria-invalid:bg-danger-soft"
        />
        <p id={`${fieldId}-hint`} data-testid="teacher-solution-counter" className={tooLong ? "text-xs font-semibold text-warning-soft-foreground" : "text-xs text-muted-foreground"}>
          {length} / en fazla {max} karakter. Metin, fotoğraf ya da ikisi birden eklenebilir.
        </p>
        {textError ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {textError}
          </p>
        ) : null}
      </div>

      <PhotoAttachment controller={photo} label="Çözüm fotoğrafı (isteğe bağlı)" hint="Çözümü kâğıda yazdıysan fotoğrafını ekleyebilirsin." disabled={mutation.isPending} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={!valid || photo.busy} loading={mutation.isPending}>
          Çözümü kaydet
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={mutation.isPending}
          onClick={() => (text.trim() === "" ? discard() : setLeaving(true))}
        >
          Vazgeç
        </Button>
      </div>
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Taslak silinsin mi?"
        description="Yazdığın çözüm metni kaydedilmeden silinir."
        confirmLabel="Taslağı sil"
        tone="danger"
        onConfirm={discard}
      />
    </form>
  );
}

export function TeacherSolutionSection({ question }: { question: QuestionDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const solutions = useQuery(solutionsQuery(api(), question.id));
  const [open, setOpen] = useState(params.get(OPEN_PARAM) === OPEN_VALUE);
  const [conflict, setConflict] = useState<ProblemState | null>(null);
  const hasTeacherSolution = (solutions.data?.items ?? []).some((item) => item.type === "teacher");

  function close() {
    setOpen(false);
    if (params.get(OPEN_PARAM)) {
      const next = new URLSearchParams(params.toString());
      next.delete(OPEN_PARAM);
      const text = next.toString();
      router.replace(`${pathname}${text ? `?${text}` : ""}`);
    }
  }

  if (!question.permissions.canWriteTeacherSolution || solutions.isPending) return null;

  return (
    <Card data-testid="teacher-solution-section">
      <CardContent className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-xl">
          <GraduationCap className="size-6 text-accent-soft-foreground" aria-hidden="true" />
          Öğretmen çözümü
        </h2>
        <ProblemBanner state={conflict} conflictAsMessage />
        {hasTeacherSolution ? (
          <p className="text-sm text-muted-foreground" data-testid="teacher-solution-exists">
            Bu soru için zaten bir öğretmen çözümü var. Çözümler listesinde görebilirsin.
          </p>
        ) : open ? (
          <TeacherSolutionForm
            questionId={question.id}
            onDone={close}
            onConflict={(state) => {
              setConflict(state);
              close();
            }}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Yanlış cevaplayan öğrenciler bilgilendirilir.</p>
            <Button
              type="button"
              className="self-start"
              onClick={() => {
                setConflict(null);
                setOpen(true);
              }}
              data-testid="teacher-solution-open"
            >
              <PenLine aria-hidden="true" />
              Öğretmen çözümü ekle
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
