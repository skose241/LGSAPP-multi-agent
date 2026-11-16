"use client";

import { formatDateTimeShort, optionToLetter } from "@lgs/api";
import { disputedQuestionsQuery, lessonsQuery, type DisputedQuestionItem } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, Flag, ImageIcon, ShieldCheck, ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { MathText } from "@/components/math-text";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { useMe } from "@/features/auth/use-me";
import { api } from "@/lib/api/client";

const PAGE_SIZE = 12;
const LETTERS = [1, 2, 3, 4] as const;

function Distribution({ item }: { item: DisputedQuestionItem }) {
  const counts = new Map(item.answerDistribution.map((entry) => [entry.option, entry.count]));
  const peak = Math.max(1, ...LETTERS.map((option) => counts.get(option) ?? 0));

  return (
    <ul className="grid grid-cols-4 gap-2" aria-label="Cevap dağılımı">
      {LETTERS.map((option) => {
        const count = counts.get(option) ?? 0;
        const isKey = option === item.correctOption;
        const isAi = option === item.aiSuggestedOption;
        return (
          <li key={option} className="flex flex-col items-center gap-1">
            <div className="flex h-12 w-full items-end rounded-sm bg-surface-muted" aria-hidden="true">
              <div className={isKey ? "w-full rounded-sm bg-correct" : isAi ? "w-full rounded-sm bg-info" : "w-full rounded-sm bg-neutral-400"} style={{ height: `${Math.round((count / peak) * 100)}%` }} />
            </div>
            <span className="text-xs font-semibold">
              {optionToLetter(option)}
              <span className="sr-only"> şıkkı</span>: {count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function DisputedCard({ item }: { item: DisputedQuestionItem }) {
  const key = optionToLetter(item.correctOption);
  const ai = item.aiSuggestedOption ? optionToLetter(item.aiSuggestedOption) : null;

  return (
    <li data-testid="disputed-item" data-question-id={item.questionId}>
      <Card className="h-full">
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="primary">{item.lessonName}</Badge>
            {item.topicName ? <Badge tone="neutral">{item.topicName}</Badge> : null}
            {item.hasImage ? (
              <Badge tone="neutral">
                <ImageIcon aria-hidden="true" />
                Görselli
              </Badge>
            ) : null}
            {item.isHidden ? <Badge tone="warning">Gizli</Badge> : null}
          </div>

          {item.summary ? <MathText text={item.summary} compact className="line-clamp-3 max-w-prose overflow-hidden text-base" /> : <p className="text-sm text-muted-foreground">Soru görsel olarak yüklenmiş.</p>}

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-correct-soft px-3 py-2 text-correct-soft-foreground">
              <dt className="text-xs">Mevcut anahtar</dt>
              <dd className="font-display text-xl font-bold" data-testid="current-key">
                {key}
              </dd>
            </div>
            <div className="rounded-md bg-info-soft px-3 py-2 text-info-soft-foreground">
              <dt className="text-xs">Yapay zekâ önerisi</dt>
              <dd className="font-display text-xl font-bold" data-testid="ai-suggestion">
                {ai ?? "-"}
              </dd>
            </div>
          </dl>

          <Distribution item={item} />

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{item.answerCount} cevap</span>
            {item.pendingWrongAnswerKeyReportCount > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-warning-soft-foreground">
                <Flag className="size-4" aria-hidden="true" />
                {item.pendingWrongAnswerKeyReportCount} bekleyen şikâyet
              </span>
            ) : null}
            {item.answerDisputedAt ? <span>{formatDateTimeShort(item.answerDisputedAt)}</span> : null}
          </p>

          <Button asChild className="mt-auto self-start">
            <Link href={`/ogretmen/supheli-anahtarlar/${item.questionId}`} aria-label={`İncele: ${item.lessonName} sorusu`}>
              İncele
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}

export function DisputedListPage() {
  const me = useMe();
  const isMudur = me.data?.role === "mudur";
  const branchName = me.data?.branchLessonName ?? null;
  const branchHint = isMudur ? null : branchName ? `Branşın: ${branchName}` : "Branşın atanmamış, müdürüne başvur.";
  const [lessonId, setLessonId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const lessons = useQuery({ ...lessonsQuery(api()), enabled: isMudur });
  const list = useQuery(disputedQuestionsQuery(api(), { lessonId: isMudur ? lessonId : undefined, page, pageSize: PAGE_SIZE }));

  const data = list.data;
  const slice = data
    ? {
        page: data.page,
        pageCount: Math.max(1, Math.ceil(data.totalCount / data.pageSize)),
        from: data.totalCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1,
        to: (data.page - 1) * data.pageSize + data.items.length,
        total: data.totalCount,
      }
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl">Şüpheli Cevap Anahtarları</h1>
        <p className="text-muted-foreground">
          Yapay zekânın cevap anahtarından farklı bir şık bulduğu sorular.{" "}
          {isMudur ? "Tüm derslerin soruları listelenir." : "Yalnızca branşındaki sorular listelenir."}
          {branchHint ? <strong data-testid="branch-hint"> {branchHint}</strong> : null}
        </p>
      </div>

      {isMudur ? (
        <div className="max-w-sm">
          <SelectField
            label="Ders"
            value={lessonId ?? ""}
            onChange={(event) => {
              setLessonId(event.target.value ? Number(event.target.value) : undefined);
              setPage(1);
            }}
          >
            <option value="">Tüm dersler</option>
            {(lessons.data ?? []).map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.name}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}

      {list.isPending ? (
        <div role="status" aria-label="Liste yükleniyor" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-72 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState
          icon={CloudOff}
          as="h2"
          title="Liste yüklenemedi"
          description={list.error.message}
          action={<Button onClick={() => list.refetch()}>Tekrar Dene</Button>}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          as="h2"
          title="Şüpheli soru yok"
          description={isMudur ? "Şu an incelenmeyi bekleyen bir cevap anahtarı yok." : branchName ? `${branchName} branşında incelenmeyi bekleyen bir cevap anahtarı yok.` : "Branşın atanmamış, bu yüzden liste boş. Müdürüne başvur."}
        />
      ) : data ? (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold text-warning-soft-foreground">
            <ShieldQuestion className="size-5" aria-hidden="true" />
            {data.totalCount} soru incelenmeyi bekliyor
          </p>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Şüpheli sorular">
            {data.items.map((item) => (
              <DisputedCard key={item.questionId} item={item} />
            ))}
          </ul>
          {slice ? <Pagination slice={slice} onPageChange={setPage} /> : null}
        </>
      ) : null}
    </div>
  );
}
