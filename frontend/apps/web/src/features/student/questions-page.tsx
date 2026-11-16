"use client";

import { lessonsQuery, questionKeys, questionsQuery, topicsQuery, type AnsweredFilter } from "@lgs/api/queries";
import { questionSourceLabel } from "@lgs/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudOff, SearchX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { PoolQuestionCard } from "@/features/student/pool-question-card";
import { api } from "@/lib/api/client";
import { filtersToSearch, parseFilters, type QuestionFilters } from "@/lib/student/url-state";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

const TABS: { id: AnsweredFilter; label: string }[] = [
  { id: "unanswered", label: "Çözmediklerim" },
  { id: "answered", label: "Çözdüklerim" },
  { id: "all", label: "Tümü" },
];

export function QuestionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);

  const lessons = useQuery(lessonsQuery(api()));
  const topics = useQuery(topicsQuery(api(), filters.lessonId));
  const questions = useQuery(
    questionsQuery(api(), {
      lessonId: filters.lessonId,
      topicId: filters.topicId,
      source: filters.source,
      answered: filters.answered,
      page: filters.page,
      pageSize: PAGE_SIZE,
    }),
  );

  function update(next: Partial<QuestionFilters>) {
    const merged: QuestionFilters = { ...filters, page: 1, ...next };
    router.push(`${pathname}${filtersToSearch(merged)}`);
  }

  const data = questions.data;
  const pageCount = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const slice = data
    ? {
        page: data.page,
        pageCount,
        from: data.totalCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1,
        to: (data.page - 1) * data.pageSize + data.items.length,
        total: data.totalCount,
      }
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl">Soru Çöz</h1>
        <p className="text-muted-foreground">Dersini seç, soruyu çöz, çözümünü kendi cümlelerinle anlat.</p>
      </div>

      <div role="group" aria-label="Çözüm durumu" className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={filters.answered === tab.id}
            onClick={() => update({ answered: tab.id })}
            className={cn(
              "inline-flex min-h-touch items-center rounded-pill border px-4 text-sm font-semibold transition-colors",
              filters.answered === tab.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SelectField
          label="Ders"
          value={filters.lessonId ?? ""}
          onChange={(event) => update({ lessonId: event.target.value ? Number(event.target.value) : undefined, topicId: undefined })}
        >
          <option value="">Tüm dersler</option>
          {(lessons.data ?? []).map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Konu"
          value={filters.topicId ?? ""}
          disabled={!filters.lessonId || topics.isPending}
          onChange={(event) => update({ topicId: event.target.value ? Number(event.target.value) : undefined })}
        >
          <option value="">Tüm konular</option>
          {(topics.data ?? []).map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Kaynak"
          value={filters.source ?? ""}
          onChange={(event) => update({ source: (event.target.value || undefined) as QuestionFilters["source"] })}
        >
          <option value="">Tüm kaynaklar</option>
          {(["teacher", "student", "ai"] as const).map((source) => (
            <option key={source} value={source}>
              {questionSourceLabel(source)}
            </option>
          ))}
        </SelectField>
      </div>

      {questions.isPending ? (
        <div role="status" aria-label="Sorular yükleniyor" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-72 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : questions.isError ? (
        <EmptyState
          icon={CloudOff}
          as="h2"
          title="Sorular yüklenemedi"
          description={questions.error.message}
          action={<Button onClick={() => questions.refetch()}>Tekrar Dene</Button>}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          as="h2"
          title="Bu filtrelerle soru yok"
          description="Başka bir ders, konu ya da durum seçmeyi dene."
        />
      ) : data ? (
        <>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Sorular" aria-busy={questions.isPlaceholderData || undefined}>
            {data.items.map((item) => (
              <li key={item.id}>
                <PoolQuestionCard item={item} onImageExpired={() => void queryClient.invalidateQueries({ queryKey: questionKeys.all })} />
              </li>
            ))}
          </ul>
          {slice ? <Pagination slice={slice} onPageChange={(page) => update({ page })} /> : null}
        </>
      ) : null}
    </div>
  );
}
