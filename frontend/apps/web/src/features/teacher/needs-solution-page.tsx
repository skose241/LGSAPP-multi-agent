"use client";

import { isApiError, optionToLetter } from "@lgs/api";
import {
  lessonsQuery,
  needsSolutionQuery,
  teacherKeys,
  teacherMutations,
  type NeedsSolutionItem,
} from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, CheckCircle2, CloudOff, ImageIcon, PenLine, ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { MathText } from "@/components/math-text";
import { Pagination } from "@/components/pagination";
import type { ProblemState } from "@/components/problem-banner";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SelectField } from "@/components/ui/select-field";
import { useMe } from "@/features/auth/use-me";
import { toProblemState } from "@/features/student/comment-node";
import { api } from "@/lib/api/client";
import { isForbidden, isNoBranch, solutionHref, thresholdSentence, wrongRateLabel } from "@/lib/teacher/needs-solution";
import { lastValidPage, pageSlice } from "@/lib/teacher/students";

const PAGE_SIZE = 12;
const VIEW_DISMISSED = "cikarilanlar";

function positiveInt(value: string | null): number | undefined {
  if (!value || !/^[0-9]{1,9}$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}

export function NoBranchNotice() {
  return (
    <div data-testid="no-branch">
      <EmptyState
        icon={ShieldQuestion}
        as="h2"
        title="Branş Tanımlanmamış"
        description="Hesabınıza branş dersi tanımlanmamış. Branşa bağlı ekranlar için müdüre başvurun."
      />
    </div>
  );
}

function NeedsCard({ item, dismissed, onRemove, onRestore, onImageExpired }: { item: NeedsSolutionItem; dismissed: boolean; onRemove: (item: NeedsSolutionItem) => void; onRestore: (item: NeedsSolutionItem) => void; onImageExpired: () => void }) {
  const key = optionToLetter(item.correctOption);

  return (
    <li data-testid="needs-item" data-question-id={item.id}>
      <Card className="h-full">
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="primary">{item.lesson.name}</Badge>
            {item.topic ? <Badge tone="neutral">{item.topic.name}</Badge> : null}
            {item.isAnswerDisputed ? (
              <Badge tone="warning">
                <ShieldQuestion aria-hidden="true" />
                Şüpheli Anahtar
              </Badge>
            ) : null}
          </div>

          {item.image ? <QuestionImage image={item.image} alt={`${item.lesson.name} sorusu görseli`} variant="thumb" onExpired={onImageExpired} className="aspect-[4/3] object-cover" /> : null}
          {item.previewText ? (
            <MathText text={item.previewText} compact className="line-clamp-4 max-w-prose overflow-hidden text-base" />
          ) : item.image ? null : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="size-4" aria-hidden="true" />
              Önizleme Yok
            </p>
          )}

          <dl className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-md bg-wrong-soft px-2 py-2 text-wrong-soft-foreground">
              <dt className="text-xs">Yanlış Oranı</dt>
              <dd className="font-display text-xl font-bold" data-testid="wrong-rate">
                {wrongRateLabel(item.wrongRate)}
              </dd>
            </div>
            <div className="rounded-md bg-surface-muted px-2 py-2">
              <dt className="text-xs text-muted-foreground">Çözen / Yanlış</dt>
              <dd className="font-display text-xl font-bold" data-testid="answer-counts">
                {item.totalAnswers} / {item.wrongAnswers}
              </dd>
            </div>
            <div className="rounded-md bg-correct-soft px-2 py-2 text-correct-soft-foreground">
              <dt className="text-xs">Kayıtlı Cevap</dt>
              <dd className="font-display text-xl font-bold">{key ?? "-"}</dd>
            </div>
          </dl>

          <div className="mt-auto flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href={solutionHref(item.id)} aria-label={`Çözüm ekle: ${item.lesson.name} sorusu ${item.id}`}>
                <PenLine aria-hidden="true" />
                Çözüm Ekle
              </Link>
            </Button>
            {dismissed ? (
              <Button type="button" variant="secondary" onClick={() => onRestore(item)} aria-label={`Listeye geri al: ${item.lesson.name} sorusu ${item.id}`}>
                Listeye Geri Al
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={() => onRemove(item)} aria-label={`Listeden çıkar: ${item.lesson.name} sorusu ${item.id}`}>
                Listeden Çıkar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

export function NeedsSolutionPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const me = useMe();
  const isMudur = me.data?.role === "mudur";
  const branchless = isNoBranch(me.data?.role, me.data?.branchLessonId);
  const lessonId = useMemo(() => (isMudur ? positiveInt(params.get("ders")) : undefined), [isMudur, params]);
  const dismissedView = params.get("gorunum") === VIEW_DISMISSED;
  const page = positiveInt(params.get("sayfa")) ?? 1;
  const lessons = useQuery({ ...lessonsQuery(api()), enabled: isMudur });
  const list = useQuery(needsSolutionQuery(api(), { lessonId, dismissed: dismissedView, page, pageSize: PAGE_SIZE }, me.isSuccess && !branchless));
  const [target, setTarget] = useState<NeedsSolutionItem | null>(null);
  const [error, setError] = useState<ProblemState | null>(null);

  function go(next: { lessonId?: number; page?: number; dismissed?: boolean }, mode: "push" | "replace" = "push") {
    const search = new URLSearchParams();
    const nextLesson = "lessonId" in next ? next.lessonId : lessonId;
    const nextDismissed = next.dismissed ?? dismissedView;
    if (nextLesson) search.set("ders", String(nextLesson));
    if (nextDismissed) search.set("gorunum", VIEW_DISMISSED);
    if (next.page && next.page > 1) search.set("sayfa", String(next.page));
    const text = search.toString();
    const href = `${pathname}${text ? `?${text}` : ""}`;
    if (mode === "replace") router.replace(href);
    else router.push(href);
  }

  const clampTo = list.data ? lastValidPage(list.data.page, list.data.pageSize, list.data.totalCount, list.data.items.length) : null;

  useEffect(() => {
    if (clampTo !== null) go({ page: clampTo }, "replace");
  }, [clampTo]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: teacherKeys.needsAll });

  const restore = async (id: number, message: string) => {
    try {
      await teacherMutations.clearSolutionNotNeeded(api(), id);
      toast.success(message);
    } catch (e) {
      toast.error(isApiError(e) ? e.problem.message : "Geri alınamadı.");
    }
    await queryClient.invalidateQueries({ queryKey: teacherKeys.needsAll });
  };

  const remove = useMutation({
    mutationFn: (item: NeedsSolutionItem) => teacherMutations.markSolutionNotNeeded(api(), item.id),
    onSuccess: async (_data, item) => {
      setTarget(null);
      setError(null);
      toast.success("Soru listeden çıkarıldı.", {
        action: { label: "Geri Al", onClick: () => void restore(item.id, "Soru listeye geri alındı.") },
        duration: 10_000,
      });
      await refresh();
    },
    onError: async (e: unknown) => {
      setError(toProblemState(e));
      if (isApiError(e) && (e.status === 404 || e.status === 409)) await refresh();
    },
  });

  const data = list.data;
  const slice = data ? pageSlice(data.page, data.pageSize, data.totalCount, data.items.length) : null;
  const forbidden = list.isError && isForbidden(list.error);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl">Çözüm Bekleyenler</h1>
        <p className="text-muted-foreground" data-testid="threshold-sentence">
          {dismissedView
            ? "Listeden çıkardığınız sorular. İstediğinizi listeye geri alabilirsiniz."
            : data
              ? `${thresholdSentence(data.thresholdAnswers, data.thresholdWrongRate)}.`
              : "Çok öğrencinin yanlış yaptığı ve öğretmen çözümü olmayan sorular."}
        </p>
      </div>

      <div role="group" aria-label="Görünüm" className="flex flex-wrap gap-2">
        {[
          { id: false, label: "Bekleyenler" },
          { id: true, label: "Çıkarılanlar" },
        ].map((tab) => (
          <button
            key={String(tab.id)}
            type="button"
            aria-pressed={dismissedView === tab.id}
            onClick={() => go({ dismissed: tab.id, page: 1 })}
            className={cn(
              "inline-flex min-h-touch items-center rounded-pill border px-4 text-sm font-semibold transition-colors",
              dismissedView === tab.id ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isMudur ? (
        <div className="max-w-sm">
          <SelectField label="Ders" value={lessonId ?? ""} onChange={(event) => go({ lessonId: event.target.value ? Number(event.target.value) : undefined, page: 1 })}>
            <option value="">Tüm Dersler</option>
            {(lessons.data ?? []).map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.name}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}

      {branchless ? (
        <NoBranchNotice />
      ) : me.isPending || list.isPending ? (
        <div role="status" aria-label="Liste yükleniyor" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-72 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState
          icon={forbidden ? ShieldQuestion : CloudOff}
          as="h2"
          title={forbidden ? "Bu Listeye Erişiminiz Yok" : "Liste Yüklenemedi"}
          description={list.error.message}
          action={forbidden ? undefined : <Button onClick={() => list.refetch()}>Tekrar Dene</Button>}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          as="h2"
          title={dismissedView ? "Çıkarılan Soru Yok" : "Çözüm Bekleyen Soru Yok"}
          description={dismissedView ? "Listeden çıkardığınız bir soru yok." : "Eşiği geçen ve öğretmen çözümü olmayan soru şu an yok."}
        />
      ) : data ? (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold" data-testid="needs-total">
            <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
            {dismissedView ? `${data.totalCount} soru listeden çıkarılmış` : `${data.totalCount} soru çözüm bekliyor`}
          </p>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Çözüm bekleyen sorular">
            {data.items.map((item) => (
              <NeedsCard
                key={item.id}
                item={item}
                dismissed={dismissedView}
                onRestore={(picked) => void restore(picked.id, "Soru listeye geri alındı.")}
                onRemove={(picked) => {
                  setError(null);
                  setTarget(picked);
                }}
                onImageExpired={() => void refresh()}
              />
            ))}
          </ul>
          {slice ? <Pagination slice={slice} onPageChange={(next) => go({ page: next })} /> : null}
        </>
      ) : null}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title="Soru listeden çıkarılsın mı?"
        description="Bu soru artık çözüm bekleyenler listesinde görünmez. İsterseniz hemen geri alabilirsiniz."
        confirmLabel="Listeden Çıkar"
        pending={remove.isPending}
        error={error}
        conflictAsMessage
        onConfirm={() => {
          if (target) remove.mutate(target);
        }}
      />
    </div>
  );
}
