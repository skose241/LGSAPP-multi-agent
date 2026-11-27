"use client";

import { adminUsersQuery, lessonsQuery, questionKeys, questionsQuery, topicsQuery, type AnsweredFilter } from "@lgs/api/queries";
import { questionSourceLabel } from "@lgs/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudOff, SearchX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { useMe } from "@/features/auth/use-me";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { PoolQuestionCard } from "@/features/student/pool-question-card";
import { api } from "@/lib/api/client";
import { filtersToSearch, parseFilters, parseModeratorFilters, type ModeratorFilters, type QuestionFilters } from "@/lib/student/url-state";
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
  const me = useMe();
  const mudur = me.data?.role === "mudur";
  const moderator = mudur || me.data?.role === "ogretmen";
  const parsed = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const filters = useMemo<QuestionFilters>(() => (moderator ? { ...parsed, answered: "all" } : parsed), [parsed, moderator]);

  const modParsed = useMemo(() => parseModeratorFilters(new URLSearchParams(params.toString()), mudur), [params, mudur]);
  const mod = useMemo<ModeratorFilters>(
    () => (moderator ? modParsed : { scheduled: false, includeHidden: false }),
    [modParsed, moderator],
  );

  useEffect(() => {
    if (moderator) document.title = "Soru Havuzu | LGS Hazırlık";
    else if (!me.isPending) document.title = "Soru Çöz | LGS Hazırlık";
  }, [moderator, me.isPending]);

  const authors = useQuery({ ...adminUsersQuery(api(), "ogretmen"), enabled: mudur });
  const authorOptions = useMemo(
    () =>
      (authors.data ?? [])
        .filter((user) => !user.isSystemAccount)
        .map((user) => ({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim() || user.userName })),
    [authors.data],
  );

  const lessons = useQuery(lessonsQuery(api()));
  const topics = useQuery(topicsQuery(api(), filters.lessonId));
  const questions = useQuery({
    ...questionsQuery(api(), {
      lessonId: filters.lessonId,
      topicId: filters.topicId,
      source: filters.source,
      answered: filters.answered,
      scheduled: mod.scheduled,
      includeHidden: mod.includeHidden,
      authorId: mod.authorId,
      page: filters.page,
      pageSize: PAGE_SIZE,
    }),
    enabled: !me.isPending,
  });

  function update(next: Partial<QuestionFilters>, nextMod?: Partial<ModeratorFilters>) {
    const merged: QuestionFilters = { ...parsed, page: 1, ...next };
    const mergedMod: ModeratorFilters = { ...mod, ...nextMod };
    router.push(`${pathname}${filtersToSearch(merged, moderator ? mergedMod : undefined)}`);
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
        <h1 className="text-3xl">{moderator ? "Soru Havuzu" : "Soru Çöz"}</h1>
        <p className="text-muted-foreground">
          {moderator
            ? "Havuzdaki soruları, görsel kırpmalarını ve çözümleri inceleyin. Ders, konu ve kaynağa göre süzebilirsiniz."
            : "Dersinizi seçin, soruyu çözün, çözümünüzü kendi cümlelerinizle anlatın."}
        </p>
      </div>

      {moderator ? null : (
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
      )}

      {moderator ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div role="group" aria-label="Yayın durumu" className="flex flex-wrap gap-2">
            {([
              { id: false, label: "Yayında" },
              { id: true, label: "Planlanmış" },
            ] as const).map((tab) => (
              <button
                key={tab.label}
                type="button"
                aria-pressed={mod.scheduled === tab.id}
                onClick={() => update({}, { scheduled: tab.id, includeHidden: tab.id ? false : mod.includeHidden })}
                className={cn(
                  "inline-flex min-h-touch items-center rounded-pill border px-4 text-sm font-semibold transition-colors",
                  mod.scheduled === tab.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {mod.scheduled ? null : (
            <label className="inline-flex min-h-touch items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-5"
                checked={mod.includeHidden}
                onChange={(event) => update({}, { includeHidden: event.target.checked })}
              />
              Gizlileri de göster
            </label>
          )}
        </div>
      ) : null}

      <div className={cn("grid gap-3 md:grid-cols-3", mudur && "lg:grid-cols-4")}>
        <SelectField
          label="Ders"
          value={filters.lessonId ?? ""}
          onChange={(event) => update({ lessonId: event.target.value ? Number(event.target.value) : undefined, topicId: undefined })}
        >
          <option value="">Tüm Dersler</option>
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
          <option value="">Tüm Konular</option>
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
          <option value="">Tüm Kaynaklar</option>
          {(["teacher", "student", "ai"] as const).map((source) => (
            <option key={source} value={source}>
              {questionSourceLabel(source)}
            </option>
          ))}
        </SelectField>
        {mudur ? (
          <SelectField
            label="Ekleyen"
            value={mod.authorId ?? ""}
            onChange={(event) => update({}, { authorId: event.target.value ? Number(event.target.value) : undefined })}
          >
            <option value="">Tüm Öğretmenler</option>
            {authorOptions.map((author) => (
              <option key={author.id} value={author.id}>
                {author.name}
              </option>
            ))}
          </SelectField>
        ) : null}
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
          title="Sorular Yüklenemedi"
          description={questions.error.message}
          action={<Button onClick={() => questions.refetch()}>Tekrar Dene</Button>}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          as="h2"
          title="Bu Filtrelerle Soru Yok"
          description={mod.scheduled ? "Planlanmış soru bulunmuyor ya da süzgeçlere uymuyor." : "Başka bir ders, konu ya da durum seçmeyi deneyin."}
        />
      ) : data ? (
        <>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Sorular" aria-busy={questions.isPlaceholderData || undefined}>
            {data.items.map((item) => (
              <li key={item.id}>
                <PoolQuestionCard item={item} moderator={moderator} onImageExpired={() => queryClient.invalidateQueries({ queryKey: questionKeys.all })} />
              </li>
            ))}
          </ul>
          {slice ? <Pagination slice={slice} onPageChange={(page) => update({ page })} /> : null}
        </>
      ) : null}
    </div>
  );
}
