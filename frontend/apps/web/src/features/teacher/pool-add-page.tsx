"use client";

import { addDaysToDateOnly, formatDateOnly, isDateOnly, todayInIstanbul } from "@lgs/api";
import { assignmentKeys, lessonsQuery, questionKeys, questionMutations, scheduledQuestionsQuery } from "@lgs/api/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ImageIcon, Send } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { MathText } from "@/components/math-text";
import { Pagination } from "@/components/pagination";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { useMe } from "@/features/auth/use-me";
import { NoBranchNotice } from "@/features/teacher/needs-solution-page";
import { PhotoQuestionComposer, toComposerFailure, type ComposerSubmitInput, type ComposerSubmitResult } from "@/features/upload/photo-question-composer";
import { api } from "@/lib/api/client";
import { textOrNull } from "@/lib/teacher/composer";
import { isNoBranch } from "@/lib/teacher/needs-solution";
import { pageSlice } from "@/lib/teacher/students";
import { cn } from "@/lib/utils";

const PLANNED_PAGE_SIZE = 10;
const MAX_CARDS = 20;

type PublishMode = "now" | "scheduled";

function PlannedList({ lessonId }: { lessonId: number }) {
  const [page, setPage] = useState(1);
  const list = useQuery(scheduledQuestionsQuery(api(), { lessonId, page, pageSize: PLANNED_PAGE_SIZE }));
  const data = list.data;
  const slice = data ? pageSlice(data.page, data.pageSize, data.totalCount, data.items.length) : null;

  return (
    <section aria-label="Planlı sorular" className="flex flex-col gap-3" data-testid="planned-list">
      <h2 className="text-xl">Planlı sorular</h2>
      <p className="text-sm text-muted-foreground">Yayın tarihi gelmemiş, sıradaki sorular. Yayın tarihinde otomatik olarak havuza düşer.</p>
      {list.isPending ? (
        <div role="status" aria-label="Planlı sorular yükleniyor" className="h-24 animate-pulse rounded-lg bg-surface-muted" />
      ) : list.isError ? (
        <EmptyState icon={CalendarClock} as="h3" title="Planlı sorular yüklenemedi" description={list.error.message} action={<Button onClick={() => list.refetch()}>Tekrar Dene</Button>} />
      ) : data && data.items.length === 0 ? (
        <EmptyState icon={CalendarClock} as="h3" title="Planlı soru yok" description="Yukarıdan bir tarih seçerek ileri tarihli soru ekleyebilirsin." />
      ) : data ? (
        <>
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Planlı soru listesi">
            {data.items.map((item) => (
              <li key={item.id} data-testid="planned-item" data-question-id={item.id}>
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.scheduledPublishDate ? (
                        <Badge tone="info" data-testid="planned-date">
                          Yayın: {formatDateOnly(item.scheduledPublishDate)}
                        </Badge>
                      ) : null}
                      {item.topic ? <Badge tone="neutral">{item.topic.name}</Badge> : null}
                      {item.isMine ? <Badge tone="primary">Senin sorun</Badge> : <span className="text-xs text-muted-foreground">{item.author?.fullName || item.author?.userName || ""}</span>}
                    </div>
                    {item.image ? <QuestionImage image={item.image} alt={`Planlı soru ${item.id} görseli`} variant="thumb" onExpired={() => void list.refetch()} className="max-w-xs" /> : null}
                    {item.previewText ? (
                      <MathText text={item.previewText} compact className="line-clamp-3 overflow-hidden text-base" />
                    ) : item.image ? null : (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <ImageIcon className="size-4" aria-hidden="true" />
                        Önizleme yok
                      </span>
                    )}
                    <Button asChild variant="secondary" className="mt-auto self-start">
                      <Link href={`/sorular/${item.id}`} aria-label={`Soruyu aç: ${item.id}`}>
                        Soruyu aç
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {slice ? <Pagination slice={slice} onPageChange={setPage} /> : null}
        </>
      ) : null}
    </section>
  );
}

export function PoolAddPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const lessons = useQuery(lessonsQuery(api()));
  const modeId = useId();
  const today = todayInIstanbul();
  const tomorrow = addDaysToDateOnly(today, 1);
  const [lessonChoice, setLessonChoice] = useState<number | null>(null);
  const [mode, setMode] = useState<PublishMode>("now");
  const [date, setDate] = useState(tomorrow);

  const isMudur = me.data?.role === "mudur";
  const branchless = isNoBranch(me.data?.role, me.data?.branchLessonId);
  const lessonId = isMudur ? lessonChoice : (me.data?.branchLessonId ?? null);

  async function submitCard(input: ComposerSubmitInput): Promise<ComposerSubmitResult> {
    try {
      const created = await questionMutations.create(api(), {
        lessonId: lessonId ?? 0,
        topicId: input.topicId,
        text: null,
        imageFileId: input.fileId,
        optionA: null,
        optionB: null,
        optionC: null,
        optionD: null,
        correctOption: input.correctOption,
        description: textOrNull(input.description),
        scheduledPublishDate: mode === "scheduled" ? date : null,
        clientRequestId: input.requestId,
      });
      return { ok: true, id: created.id };
    } catch (error) {
      return toComposerFailure(error);
    }
  }

  function validateExtra(): string | null {
    if (mode === "scheduled" && (!isDateOnly(date) || date < tomorrow)) return "Yayın tarihi yarın ya da daha sonrası olmalı.";
    return null;
  }

  async function onCreated() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: assignmentKeys.scheduledAll }),
      queryClient.invalidateQueries({ queryKey: questionKeys.all }),
    ]);
  }

  if (branchless) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl">Havuza Soru Ekle</h1>
        <NoBranchNotice />
      </div>
    );
  }

  const lessonOptions = lessons.data ?? [];

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-3xl">Havuza Soru Ekle</h1>
        <p className="text-muted-foreground">Soru fotoğraflarını seç, doğru şıkkı işaretle. Soruları hemen yayınlayabilir ya da ileri bir tarihe planlayabilirsin.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <SelectField
            label="Ders"
            required
            value={lessonId ?? ""}
            disabled={!isMudur}
            hint={isMudur ? undefined : "Sorular branş dersine eklenir."}
            onChange={(event) => setLessonChoice(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Ders seç</option>
            {lessonOptions.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.name}
              </option>
            ))}
          </SelectField>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">Yayın zamanı</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Yayın zamanı">
              {(
                [
                  { value: "now", label: "Hemen yayınla" },
                  { value: "scheduled", label: "Şu tarihte yayınla" },
                ] as const
              ).map((entry) => (
                <label
                  key={entry.value}
                  htmlFor={`${modeId}-${entry.value}`}
                  className={cn(
                    "inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-pill border px-4 text-sm font-semibold",
                    mode === entry.value ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border-strong bg-surface",
                  )}
                >
                  <input id={`${modeId}-${entry.value}`} type="radio" name={modeId} className="size-4 accent-primary" checked={mode === entry.value} onChange={() => setMode(entry.value)} />
                  {entry.label}
                </label>
              ))}
            </div>
            {mode === "scheduled" ? (
              <TextField
                label="Yayın tarihi"
                type="date"
                min={tomorrow}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                hint="Soru seçtiğin gün havuza düşer. En erken yarın seçilebilir."
                className="max-w-xs"
              />
            ) : null}
          </fieldset>
        </CardContent>
      </Card>

      {lessonId === null ? (
        <EmptyState icon={Send} as="h2" title="Önce dersi seç" description="Ders seçtikten sonra fotoğraf ekleyebilirsin." />
      ) : (
        <section aria-label="Soru fotoğrafları" className="flex flex-col gap-3">
          <h2 className="text-xl">Soru fotoğrafları</h2>
          <PhotoQuestionComposer
            lessonId={lessonId}
            purpose="QuestionImage"
            maxCards={MAX_CARDS}
            submitCard={submitCard}
            onCreated={onCreated}
            validateExtra={validateExtra}
            successLabel={(count) => (mode === "scheduled" ? (count === 1 ? "Soru planlandı." : `${count} soru planlandı.`) : count === 1 ? "Soru yayınlandı." : `${count} soru yayınlandı.`)}
            createdNote={(id) =>
              id ? (
                <Link href={`/sorular/${id}`} className="font-semibold underline">
                  Soruyu aç
                </Link>
              ) : null
            }
          />
        </section>
      )}

      {lessonId !== null ? <PlannedList lessonId={lessonId} /> : null}
    </div>
  );
}
