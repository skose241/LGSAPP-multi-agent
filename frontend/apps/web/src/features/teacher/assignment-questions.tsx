"use client";

import { isApiError, letterToOption, optionToLetter, questionSourceLabel } from "@lgs/api";
import { assignmentMutations, topicsQuery, type AssignmentManageDetail, type AssignmentManageQuestion } from "@lgs/api/queries";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, EyeOff, ImageIcon, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MathText } from "@/components/math-text";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { TextAreaField, TextField } from "@/components/ui/field";
import { OptionPicker } from "@/components/ui/option-picker";
import { SelectField } from "@/components/ui/select-field";
import { toProblemState } from "@/features/student/comment-node";
import { api } from "@/lib/api/client";
import { CARD_DESCRIPTION_MAX, OPTION_TEXT_MAX, QUESTION_TEXT_MAX } from "@/lib/teacher/composer";
import { moveId } from "@/lib/teacher/assignments";

interface QuestionsSectionProps {
  detail: AssignmentManageDetail;
  editable: boolean;
  onFailure: (error: unknown) => Promise<void>;
  onChanged: () => Promise<void>;
  onImageExpired: () => void;
}

interface EditFormProps {
  assignmentId: number;
  lessonId: number;
  question: AssignmentManageQuestion;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onConflict: (error: unknown) => Promise<void>;
  onCloseAutoFocus: (event: Event) => void;
}

const OPTION_KEYS = ["a", "b", "c", "d"] as const;

function EditQuestionDialog({ assignmentId, lessonId, question, onClose, onSaved, onConflict, onCloseAutoFocus }: EditFormProps) {
  const contentEditable = question.createdForAssignment;
  const topics = useQuery({ ...topicsQuery(api(), lessonId), enabled: contentEditable });
  const [option, setOption] = useState<string | undefined>(optionToLetter(question.correctOption) ?? undefined);
  const [text, setText] = useState(question.text ?? "");
  const [options, setOptions] = useState<[string, string, string, string]>([
    question.options.a ?? "",
    question.options.b ?? "",
    question.options.c ?? "",
    question.options.d ?? "",
  ]);
  const [description, setDescription] = useState(question.description ?? "");
  const [topicId, setTopicId] = useState<number | null>(question.topic?.id ?? null);
  const [error, setError] = useState<ProblemState | null>(null);
  const [confirming, setConfirming] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const correct = option ? (letterToOption(option) ?? null) : null;
      const optionsChanged = OPTION_KEYS.some((key, index) => (question.options[key] ?? "") !== (options[index] ?? ""));
      return assignmentMutations.updateQuestion(api(), assignmentId, question.id, {
        text: contentEditable && text !== (question.text ?? "") ? text : null,
        imageFileId: null,
        optionA: contentEditable && optionsChanged ? options[0].trim() : null,
        optionB: contentEditable && optionsChanged ? options[1].trim() : null,
        optionC: contentEditable && optionsChanged ? options[2].trim() : null,
        optionD: contentEditable && optionsChanged ? options[3].trim() : null,
        correctOption: correct !== null && correct !== question.correctOption ? correct : null,
        topicId: contentEditable && topicId !== (question.topic?.id ?? null) ? (topicId ?? 0) : null,
        description: contentEditable && description !== (question.description ?? "") ? description : null,
        rowVersion: question.rowVersion,
      });
    },
    onSuccess: async () => {
      toast.success("Soru güncellendi.");
      await onSaved();
      onClose();
    },
    onError: async (e: unknown) => {
      if (isApiError(e) && (e.status === 409 || e.status === 404)) {
        onClose();
        await onConflict(e);
        return;
      }
      setError(toProblemState(e));
    },
  });

  const poolAnswerChange = !contentEditable && option !== undefined && (letterToOption(option) ?? null) !== question.correctOption;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (poolAnswerChange) {
      setConfirming(true);
      return;
    }
    save.mutate();
  }

  function cancelPoolChange() {
    setConfirming(false);
    setOption(optionToLetter(question.correctOption) ?? undefined);
  }

  function confirmPoolChange() {
    setConfirming(false);
    save.mutate();
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => (!open && !save.isPending ? onClose() : undefined)}>
        <DialogContent title="Soruyu Düzenle" description={contentEditable ? "Soru içeriğini ve doğru şıkkı değiştirebilirsiniz." : "Havuzdan eklenen sorunun yalnızca doğru şıkkı değiştirilebilir."} className="md:max-w-2xl" onCloseAutoFocus={onCloseAutoFocus}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <ProblemBanner state={error} conflictAsMessage />
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold">Doğru Cevap</p>
              <OptionPicker value={option} onValueChange={setOption} disabled={save.isPending} label="Doğru Cevap" />
              {!contentEditable ? (
                <p className="text-sm text-muted-foreground" data-testid="pool-answer-note">
                  Havuz sorusu: şık değişimi tüm cevapları etkiler.
                </p>
              ) : null}
            </div>
            {contentEditable ? (
              <>
                <TextAreaField label="Soru Metni" value={text} maxLength={QUESTION_TEXT_MAX} disabled={save.isPending} onChange={(event) => setText(event.target.value)} />
                <fieldset className="grid gap-3 sm:grid-cols-2" disabled={save.isPending}>
                  <legend className="mb-1 text-sm font-semibold">Şıklar (ya Hepsi Dolu ya Hepsi Boş)</legend>
                  {(["A", "B", "C", "D"] as const).map((letter, index) => (
                    <TextField
                      key={letter}
                      label={`${letter} Şıkkı`}
                      value={options[index] ?? ""}
                      maxLength={OPTION_TEXT_MAX}
                      onChange={(event) =>
                        setOptions((current) => {
                          const next: [string, string, string, string] = [...current];
                          next[index] = event.target.value;
                          return next;
                        })
                      }
                    />
                  ))}
                </fieldset>
                <SelectField label="Konu" value={topicId ?? ""} disabled={save.isPending || topics.isPending} onChange={(event) => setTopicId(event.target.value ? Number(event.target.value) : null)}>
                  <option value="">Konu Seçilmedi</option>
                  {(topics.data ?? []).map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </SelectField>
                <TextAreaField label="Açıklama" value={description} maxLength={CARD_DESCRIPTION_MAX} disabled={save.isPending} onChange={(event) => setDescription(event.target.value)} />
              </>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={save.isPending}>
                  Vazgeç
                </Button>
              </DialogClose>
              <Button type="submit" loading={save.isPending} data-testid="question-save">
                Kaydet
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) cancelPoolChange();
        }}
        title="Havuz Sorusunun Cevabı Değişecek"
        description="Bu soru soru havuzundan eklendi. Doğru şıkkı değiştirmek, soruyu ödev dışında çözmüş öğrenciler dahil tüm cevapların puanını yeniden hesaplar."
        confirmLabel="Cevabı Değiştir"
        onConfirm={confirmPoolChange}
      />
    </>
  );
}

interface RowProps {
  question: AssignmentManageQuestion;
  index: number;
  total: number;
  editable: boolean;
  busy: boolean;
  onMove: (direction: "up" | "down") => void;
  onEdit: (opener: HTMLElement) => void;
  onRemove: (opener: HTMLElement) => void;
  onImageExpired: () => void;
}

function QuestionRow({ question, index, total, editable, busy, onMove, onEdit, onRemove, onImageExpired }: RowProps) {
  const number = index + 1;
  const letter = optionToLetter(question.correctOption);
  const hasOptions = Object.values(question.options).some(Boolean);
  const answered = question.answerCount > 0;

  return (
    <li data-testid="assignment-question" data-question-id={question.id} data-order={number}>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-bold" data-testid="question-number">
              Soru {number}
            </span>
            <Badge tone="success">Doğru Cevap: {letter ?? "-"}</Badge>
            {question.topic ? <Badge tone="neutral">{question.topic.name}</Badge> : null}
            {!question.createdForAssignment ? <Badge tone="info">Havuzdan · {questionSourceLabel(question.source)}</Badge> : null}
            {question.isHidden ? (
              <Badge tone="warning">
                <EyeOff aria-hidden="true" />
                Gizlenmiş
              </Badge>
            ) : null}
            {answered ? (
              <Badge tone="primary">
                {question.answerCount} Cevap · {question.correctCount} Doğru
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {question.image ? (
              <div className="w-full sm:w-56 sm:shrink-0">
                <QuestionImage image={question.image} alt={`Soru ${number} görseli`} variant="thumb" onExpired={onImageExpired} />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {question.text ? (
                <MathText text={question.text} compact className="line-clamp-4 max-w-prose overflow-hidden text-base" />
              ) : question.image ? null : (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <ImageIcon className="size-4" aria-hidden="true" />
                  Önizleme Yok
                </span>
              )}
              {hasOptions ? (
                <ul className="grid gap-1 text-sm sm:grid-cols-2" aria-label={`Soru ${number} şıkları`}>
                  {OPTION_KEYS.map((key, optionIndex) => (
                    <li key={key} className="flex gap-1">
                      <span className="font-semibold">{"ABCD"[optionIndex]})</span>
                      <MathText text={question.options[key] ?? ""} compact className="line-clamp-2 overflow-hidden" />
                    </li>
                  ))}
                </ul>
              ) : null}
              {question.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{question.description}</p> : null}
            </div>
          </div>

          {editable ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                disabled={busy || index === 0}
                onClick={() => onMove("up")}
                aria-label={`Soru ${number}'i yukarı taşı`}
                data-move={`${question.id}-up`}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                disabled={busy || index === total - 1}
                onClick={() => onMove("down")}
                aria-label={`Soru ${number}'i aşağı taşı`}
                data-move={`${question.id}-down`}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button type="button" variant="secondary" onClick={(event) => onEdit(event.currentTarget)} aria-label={`Soru ${number}'i düzenle`}>
                <Pencil aria-hidden="true" />
                Düzenle
              </Button>
              <Button type="button" variant="secondary" onClick={(event) => onRemove(event.currentTarget)} aria-label={`Soru ${number}'i çıkar`}>
                <Trash2 aria-hidden="true" />
                Çıkar
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </li>
  );
}

export function AssignmentQuestionsSection({ detail, editable, onFailure, onChanged, onImageExpired }: QuestionsSectionProps) {
  const questions = detail.questions;
  const ids = questions.map((question) => question.id);
  const [editing, setEditing] = useState<AssignmentManageQuestion | null>(null);
  const [removing, setRemoving] = useState<AssignmentManageQuestion | null>(null);
  const [removeError, setRemoveError] = useState<ProblemState | null>(null);
  const [announce, setAnnounce] = useState("");
  const focusRequest = useRef<{ id: number; direction: "up" | "down" } | null>(null);
  const idsKey = ids.join(",");
  const openerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  function rememberOpener(opener: HTMLElement) {
    openerRef.current = opener;
  }

  function restoreFocus(event: Event) {
    event.preventDefault();
    const opener = openerRef.current;
    if (opener && opener.isConnected) opener.focus();
    else headingRef.current?.focus();
  }

  const reorder = useMutation({
    mutationFn: (next: number[]) => assignmentMutations.reorder(api(), detail.id, next),
    onError: (e: unknown) => onFailure(e),
  });

  const remove = useMutation({
    mutationFn: (question: AssignmentManageQuestion) => assignmentMutations.removeQuestion(api(), detail.id, question.id),
    onSuccess: async () => {
      setRemoving(null);
      setRemoveError(null);
      toast.success("Soru ödevden çıkarıldı.");
      await onChanged();
    },
    onError: async (e: unknown) => {
      if (isApiError(e) && (e.status === 409 || e.status === 404)) {
        setRemoving(null);
        await onFailure(e);
        return;
      }
      setRemoveError(toProblemState(e));
    },
  });

  useEffect(() => {
    const request = focusRequest.current;
    if (!request) return;
    focusRequest.current = null;
    const primary = document.querySelector<HTMLButtonElement>(`[data-move="${request.id}-${request.direction}"]`);
    const fallback = document.querySelector<HTMLButtonElement>(`[data-move="${request.id}-${request.direction === "up" ? "down" : "up"}"]`);
    (primary && !primary.disabled ? primary : fallback)?.focus();
  }, [idsKey]);

  async function move(question: AssignmentManageQuestion, direction: "up" | "down") {
    const next = moveId(ids, question.id, direction);
    if (!next) return;
    focusRequest.current = { id: question.id, direction };
    try {
      await reorder.mutateAsync(next);
    } catch {
      focusRequest.current = null;
      return;
    }
    const position = next.indexOf(question.id) + 1;
    setAnnounce(`Soru ${position}. sıraya taşındı.`);
    await onChanged();
  }

  return (
    <section aria-label="Ödev soruları" className="flex flex-col gap-3" data-testid="assignment-questions">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl outline-none">
        Sorular ({questions.length})
      </h2>
      <p role="status" aria-live="polite" className="sr-only" data-testid="reorder-status">
        {announce}
      </p>
      {questions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-center text-sm text-muted-foreground" data-testid="no-questions">
          {editable ? "Bu ödevde henüz soru yok. Aşağıdan fotoğrafla, metinle ya da havuzdan soru ekleyin." : "Bu ödevde soru yok."}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {questions.map((question, index) => (
            <QuestionRow
              key={question.id}
              question={question}
              index={index}
              total={questions.length}
              editable={editable}
              busy={reorder.isPending}
              onMove={(direction) => void move(question, direction)}
              onEdit={(opener) => {
                rememberOpener(opener);
                setEditing(question);
              }}
              onRemove={(opener) => {
                rememberOpener(opener);
                setRemoveError(null);
                setRemoving(question);
              }}
              onImageExpired={onImageExpired}
            />
          ))}
        </ol>
      )}

      {editing ? (
        <EditQuestionDialog
          key={`${editing.id}-${editing.rowVersion}`}
          assignmentId={detail.id}
          lessonId={detail.lesson.id}
          question={editing}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
          onConflict={onFailure}
          onCloseAutoFocus={restoreFocus}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Soru ödevden çıkarılsın mı?"
        description={
          removing?.createdForAssignment
            ? "Bu soru ödev için oluşturulmuştu, çıkarılırsa kaldırılır. Sonraki sorular bir sıra yukarı kayar."
            : "Soru ödevden çıkar ve havuza geri döner. Sonraki sorular bir sıra yukarı kayar."
        }
        confirmLabel="Soruyu Çıkar"
        tone="danger"
        pending={remove.isPending}
        error={removeError}
        conflictAsMessage
        onCloseAutoFocus={restoreFocus}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
        }}
      />
    </section>
  );
}
