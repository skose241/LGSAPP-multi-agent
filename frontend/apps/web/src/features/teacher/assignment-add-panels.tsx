"use client";

import { formatDateOnly, letterToOption } from "@lgs/api";
import { assignmentDetailQuery, assignmentKeys, assignmentMutations, scheduledQuestionsQuery, topicsQuery, type AssignmentManageDetail } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ImageIcon, Images, Library, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { MathText } from "@/components/math-text";
import { Pagination } from "@/components/pagination";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TextAreaField, TextField } from "@/components/ui/field";
import { OptionPicker } from "@/components/ui/option-picker";
import { SelectField } from "@/components/ui/select-field";
import { useMe } from "@/features/auth/use-me";
import { toProblemState } from "@/features/student/comment-node";
import { PhotoQuestionComposer, toComposerFailure, isConflict, type ComposerSubmitInput, type ComposerSubmitResult } from "@/features/upload/photo-question-composer";
import { api } from "@/lib/api/client";
import { ASSIGNMENT_BATCH_MAX, findAddedByImage, remainingCapacity, toggleSelection } from "@/lib/teacher/assignments";
import { CARD_DESCRIPTION_MAX, OPTION_TEXT_MAX, QUESTION_TEXT_MAX, textOrNull, validateTextQuestion } from "@/lib/teacher/composer";
import { pageSlice } from "@/lib/teacher/students";
import { cn } from "@/lib/utils";

type PanelKey = "photo" | "text" | "pool";

const PANELS: { key: PanelKey; label: string; icon: typeof Images }[] = [
  { key: "photo", label: "Fotoğrafla Ekle", icon: Images },
  { key: "text", label: "Metinle Ekle", icon: FileText },
  { key: "pool", label: "Havuzdan Ekle", icon: Library },
];

interface PanelProps {
  detail: AssignmentManageDetail;
  onChanged: () => Promise<void>;
  onFailure: (error: unknown) => Promise<void>;
  onDiscard?: (count: number) => void;
}

function PhotoPanel({ detail, onChanged, onDiscard }: PanelProps) {
  const queryClient = useQueryClient();
  const capacity = remainingCapacity(detail.questions.length);

  async function reconcileCard(id: number, input: ComposerSubmitInput): Promise<ComposerSubmitResult> {
    try {
      const fresh = await queryClient.fetchQuery({ ...assignmentDetailQuery(api(), detail.id), staleTime: 0 });
      const current = fresh.questions.find((question) => question.id === id);
      if (!current) return { ok: false, state: toProblemState(new Error("Soru ödevde bulunamadı.")), message: "Soru ödevde bulunamadı." };
      const optionChanged = current.correctOption !== input.correctOption;
      const topicChanged = (current.topic?.id ?? null) !== input.topicId;
      const descriptionChanged = (current.description ?? "") !== input.description;
      if (!optionChanged && !topicChanged && !descriptionChanged) return { ok: true, id };
      await assignmentMutations.updateQuestion(api(), detail.id, id, {
        text: null,
        imageFileId: null,
        optionA: null,
        optionB: null,
        optionC: null,
        optionD: null,
        correctOption: optionChanged ? input.correctOption : null,
        topicId: topicChanged ? (input.topicId ?? 0) : null,
        description: descriptionChanged ? input.description : null,
        rowVersion: current.rowVersion,
      });
      return { ok: true, id };
    } catch (error) {
      return toComposerFailure(error);
    }
  }

  async function submitCard(input: ComposerSubmitInput): Promise<ComposerSubmitResult> {
    const known = new Set(detail.questions.map((question) => question.id));
    try {
      const result = await assignmentMutations.addQuestions(api(), detail.id, [
        {
          text: null,
          imageFileId: input.fileId,
          optionA: null,
          optionB: null,
          optionC: null,
          optionD: null,
          correctOption: input.correctOption,
          topicId: input.topicId,
          description: textOrNull(input.description),
        },
      ]);
      const id = result.items[0]?.id ?? null;
      return { ok: true, id, alreadyPresent: id !== null && known.has(id) };
    } catch (error) {
      if (isConflict(error)) {
        try {
          const fresh = await queryClient.fetchQuery({ ...assignmentDetailQuery(api(), detail.id), staleTime: 0 });
          const existing = findAddedByImage(fresh.questions, input.fileId);
          if (existing) {
            const fix = await reconcileCard(existing.id, input);
            if (!fix.ok) return fix;
            return { ok: true, id: existing.id, alreadyPresent: known.has(existing.id) };
          }
        } catch {
          return toComposerFailure(error);
        }
      }
      return toComposerFailure(error);
    }
  }

  if (capacity === 0) {
    return <p className="text-sm text-muted-foreground">Bir ödeve en fazla 200 soru eklenebilir.</p>;
  }

  return (
    <PhotoQuestionComposer
      lessonId={detail.lesson.id}
      purpose="AssignmentImage"
      maxCards={Math.min(ASSIGNMENT_BATCH_MAX, capacity)}
      submitCard={submitCard}
      reconcileCard={reconcileCard}
      onDiscard={onDiscard}
      onCreated={onChanged}
      successLabel={(count) => (count === 1 ? "Soru ödeve eklendi." : `${count} soru ödeve eklendi.`)}
      repeatLabel={(count) => (count === 1 ? "Bu soru ödevde zaten vardı, tekrar eklenmedi." : `${count} soru ödevde zaten vardı, tekrar eklenmedi.`)}
    />
  );
}

function TextPanel({ detail, onChanged, onFailure }: PanelProps) {
  const queryClient = useQueryClient();
  const topics = useQuery(topicsQuery(api(), detail.lesson.id));
  const [text, setText] = useState("");
  const [options, setOptions] = useState<[string, string, string, string]>(["", "", "", ""]);
  const [option, setOption] = useState<string | undefined>(undefined);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<ProblemState | null>(null);
  const errors = showErrors ? validateTextQuestion({ text, options, option }) : {};

  const add = useMutation({
    mutationFn: () =>
      assignmentMutations.addQuestions(api(), detail.id, [
        {
          text: textOrNull(text),
          imageFileId: null,
          optionA: textOrNull(options[0]),
          optionB: textOrNull(options[1]),
          optionC: textOrNull(options[2]),
          optionD: textOrNull(options[3]),
          correctOption: option ? (letterToOption(option) ?? 0) : 0,
          topicId,
          description: textOrNull(description),
        },
      ]),
    onSuccess: async () => {
      setText("");
      setOptions(["", "", "", ""]);
      setOption(undefined);
      setDescription("");
      setShowErrors(false);
      setError(null);
      toast.success("Soru ödeve eklendi.");
      await onChanged();
    },
    onError: async (e: unknown) => {
      const state = toProblemState(e);
      if (state.status === 0 || state.status >= 500) {
        setError({ ...state, problem: { ...state.problem, message: "Yanıt alınamadı. Soru eklenmiş olabilir, listeyi kontrol edip gerekirse tekrar deneyin." } });
        await queryClient.invalidateQueries({ queryKey: assignmentKeys.detail(detail.id) });
        return;
      }
      if (state.status === 409) {
        await onFailure(e);
        return;
      }
      setError(state);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    setError(null);
    if (Object.keys(validateTextQuestion({ text, options, option })).length > 0) return;
    add.mutate();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" data-testid="text-panel">
      <ProblemBanner state={error} conflictAsMessage />
      <TextAreaField label="Soru Metni" required value={text} maxLength={QUESTION_TEXT_MAX} error={errors.text} disabled={add.isPending} onChange={(event) => setText(event.target.value)} hint="Matematik için $...$ ve $$...$$ yazabilirsiniz." />
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={add.isPending}>
        <legend className="mb-1 text-sm font-semibold">Şıklar (İsteğe Bağlı, ya Hepsi Dolu ya Hepsi Boş)</legend>
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
      {errors.options ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {errors.options}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold">
          Doğru Cevap
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        </p>
        <OptionPicker value={option} onValueChange={setOption} disabled={add.isPending} label="Metin sorusu için doğru cevap" />
        {errors.option ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {errors.option}
          </p>
        ) : null}
      </div>
      <SelectField label="Konu (İsteğe Bağlı)" value={topicId ?? ""} disabled={add.isPending || topics.isPending} onChange={(event) => setTopicId(event.target.value ? Number(event.target.value) : null)}>
        <option value="">Konu Seç</option>
        {(topics.data ?? []).map((topic) => (
          <option key={topic.id} value={topic.id}>
            {topic.name}
          </option>
        ))}
      </SelectField>
      <TextAreaField label="Açıklama (İsteğe Bağlı)" value={description} maxLength={CARD_DESCRIPTION_MAX} disabled={add.isPending} onChange={(event) => setDescription(event.target.value)} />
      <Button type="submit" loading={add.isPending} className="self-start" data-testid="text-submit">
        <Plus aria-hidden="true" />
        Soruyu Ekle
      </Button>
    </form>
  );
}

const POOL_PAGE_SIZE = 10;

function PoolPanel({ detail, onChanged, onFailure }: PanelProps) {
  const queryClient = useQueryClient();
  const me = useMe();
  const isMudur = me.data?.role === "mudur";
  const topics = useQuery(topicsQuery(api(), detail.lesson.id));
  const [topicId, setTopicId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<ProblemState | null>(null);
  const list = useQuery(scheduledQuestionsQuery(api(), { lessonId: detail.lesson.id, topicId, page, pageSize: POOL_PAGE_SIZE }));
  const inAssignment = new Set(detail.questions.map((question) => question.id));
  const limit = Math.min(ASSIGNMENT_BATCH_MAX, remainingCapacity(detail.questions.length));

  const attach = useMutation({
    mutationFn: () => assignmentMutations.attachQuestions(api(), detail.id, selected),
    onSuccess: async (result) => {
      setSelected([]);
      setError(null);
      toast.success(result.addedCount === 1 ? "Soru ödeve eklendi." : `${result.addedCount} soru ödeve eklendi.`);
      await Promise.all([onChanged(), queryClient.invalidateQueries({ queryKey: assignmentKeys.scheduledAll })]);
    },
    onError: async (e: unknown) => {
      const state = toProblemState(e);
      if (state.status === 409 || state.status === 404) {
        setError(state);
        await Promise.all([onFailure(e), queryClient.invalidateQueries({ queryKey: assignmentKeys.scheduledAll })]);
        return;
      }
      setError(state);
    },
  });

  const data = list.data;
  const slice = data ? pageSlice(data.page, data.pageSize, data.totalCount, data.items.length) : null;
  const visibleItems = (data?.items ?? []).filter((item) => !inAssignment.has(item.id));

  return (
    <div className="flex flex-col gap-4" data-testid="pool-panel">
      <p className="text-sm text-muted-foreground">Henüz yayınlanmamış planlı sorular arasından seçebilirsiniz. Seçilen sorular ödevin sonuna eklenir ve yayın tarihinde havuza düşmez.</p>
      <ProblemBanner state={error} conflictAsMessage />
      <SelectField
        label="Konu"
        value={topicId ?? ""}
        disabled={topics.isPending}
        onChange={(event) => {
          setTopicId(event.target.value ? Number(event.target.value) : undefined);
          setPage(1);
        }}
        className="max-w-sm"
      >
        <option value="">Tüm Konular</option>
        {(topics.data ?? []).map((topic) => (
          <option key={topic.id} value={topic.id}>
            {topic.name}
          </option>
        ))}
      </SelectField>

      {list.isPending ? (
        <div role="status" aria-label="Havuz yükleniyor" className="h-32 animate-pulse rounded-lg bg-surface-muted" />
      ) : list.isError ? (
        <EmptyState icon={Library} as="h3" title="Havuz Yüklenemedi" description={list.error.message} action={<Button onClick={() => list.refetch()}>Tekrar Dene</Button>} />
      ) : visibleItems.length === 0 ? (
        <EmptyState icon={Library} as="h3" title="Eklenebilecek Soru Yok" description="Bu derste, ödevde olmayan planlı soru bulunmuyor. Havuza Soru Ekle ekranından ileri tarihli soru ekleyebilirsiniz." />
      ) : (
        <>
          <ul className="flex flex-col gap-2" aria-label="Havuzdaki planlı sorular">
            {visibleItems.map((item) => {
              const allowed = isMudur || item.isMine;
              const checked = selected.includes(item.id);
              return (
                <li key={item.id} data-testid="pool-item" data-question-id={item.id}>
                  <label
                    className={cn(
                      "flex min-h-touch cursor-pointer items-start gap-3 rounded-lg border bg-surface p-3",
                      checked ? "border-primary bg-primary-soft" : "border-border",
                      !allowed && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0 accent-primary"
                      checked={checked}
                      disabled={!allowed || (!checked && selected.length >= limit)}
                      onChange={() => setSelected((current) => toggleSelection(current, item.id, limit))}
                      aria-label={`Soru ${item.id} seç`}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {item.topic ? <Badge tone="neutral">{item.topic.name}</Badge> : null}
                        {item.scheduledPublishDate ? <Badge tone="info">Yayın: {formatDateOnly(item.scheduledPublishDate)}</Badge> : null}
                        {!allowed ? <Badge tone="warning">Başka Öğretmenin Sorusu</Badge> : null}
                        <span className="text-xs text-muted-foreground">{item.author?.fullName || item.author?.userName || ""}</span>
                      </span>
                      {item.image ? (
                        <span className="block max-w-xs">
                          <QuestionImage image={item.image} alt={`Soru ${item.id} görseli`} variant="thumb" onExpired={() => void list.refetch()} />
                        </span>
                      ) : null}
                      {item.previewText ? (
                        <MathText text={item.previewText} compact className="line-clamp-3 overflow-hidden text-base" />
                      ) : item.image ? null : (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <ImageIcon className="size-4" aria-hidden="true" />
                          Önizleme Yok
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {slice ? <Pagination slice={slice} onPageChange={setPage} /> : null}
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => attach.mutate()} loading={attach.isPending} disabled={selected.length === 0} data-testid="pool-attach">
          <Plus aria-hidden="true" />
          Seçilenleri Ekle ({selected.length})
        </Button>
        {selected.length >= limit && limit > 0 ? <p className="text-sm text-muted-foreground">Tek seferde en fazla {limit} soru seçilebilir.</p> : null}
      </div>
    </div>
  );
}

export function AssignmentAddPanels(props: PanelProps) {
  const [panel, setPanel] = useState<PanelKey>("photo");
  const [poolVisited, setPoolVisited] = useState(false);

  function choose(key: PanelKey) {
    setPanel(key);
    if (key === "pool") setPoolVisited(true);
  }

  return (
    <section aria-label="Soru ekle" className="flex flex-col gap-4" data-testid="add-panels">
      <h2 className="text-xl">Soru Ekle</h2>
      <div role="group" aria-label="Soru ekleme yöntemi" className="flex flex-wrap gap-2">
        {PANELS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={panel === entry.key}
            onClick={() => choose(entry.key)}
            className={cn(
              "inline-flex min-h-touch items-center gap-2 rounded-pill border px-4 text-sm font-semibold transition-colors",
              panel === entry.key ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
            )}
          >
            <entry.icon className="size-4" aria-hidden="true" />
            {entry.label}
          </button>
        ))}
      </div>
      <Card>
        <CardContent>
          <div hidden={panel !== "photo"}>
            <PhotoPanel {...props} />
          </div>
          <div hidden={panel !== "text"}>
            <TextPanel {...props} />
          </div>
          <div hidden={panel !== "pool"}>{poolVisited ? <PoolPanel {...props} /> : null}</div>
        </CardContent>
      </Card>
    </section>
  );
}
