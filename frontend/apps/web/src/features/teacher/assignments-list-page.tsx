"use client";

import { formatDateOnly, todayInIstanbul } from "@lgs/api";
import { lessonsQuery, manageAssignmentsQuery, type AssignmentManageItem } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ClipboardList, CloudOff, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { useMe } from "@/features/auth/use-me";
import { api } from "@/lib/api/client";
import {
  ASSIGNMENT_TABS,
  assignmentFiltersToSearch,
  parseAssignmentFilters,
  remainingLabel,
  stateLabel,
  stateTone,
  type AssignmentFilters,
} from "@/lib/teacher/assignments";
import { lastValidPage, pageSlice } from "@/lib/teacher/students";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

function AssignmentCard({ item, today, meId }: { item: AssignmentManageItem; today: string; meId: number | undefined }) {
  const mineOwner = meId !== undefined && item.teacher.id === meId;
  const hasResults = item.state === "open" || item.state === "closed";
  return (
    <li data-testid="manage-assignment" data-assignment-id={item.id}>
      <Card className="h-full">
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="primary">{item.lesson.name}</Badge>
            <Badge tone={stateTone(item.state)} data-testid="assignment-state">
              {stateLabel(item.state)}
            </Badge>
            {!item.canModify ? <Badge tone="neutral">Salt Okunur</Badge> : null}
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              <Link href={`/ogretmen/odevler/${item.id}`} className="inline-flex min-h-touch items-center text-primary underline underline-offset-4">
                {item.title}
              </Link>
            </h2>
            <p className="text-sm text-muted-foreground">{mineOwner ? "Sizin ödeviniz" : item.teacher.fullName || item.teacher.userName}</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-md bg-surface-muted px-2 py-2">
              <dt className="text-xs text-muted-foreground">Soru</dt>
              <dd className="font-display text-xl font-bold" data-testid="question-count">
                {item.questionCount}
              </dd>
            </div>
            <div className="rounded-md bg-surface-muted px-2 py-2">
              <dt className="text-xs text-muted-foreground">Katılan</dt>
              <dd className="font-display text-xl font-bold" data-testid="participant-count">
                {item.participantCount}
              </dd>
            </div>
            <div className="rounded-md bg-surface-muted px-2 py-2">
              <dt className="text-xs text-muted-foreground">Durum</dt>
              <dd className="text-sm font-semibold">{remainingLabel(item.state, item.startDate, item.endDate, today)}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            {formatDateOnly(item.startDate)} – {formatDateOnly(item.endDate)}
          </p>
          <div className="mt-auto flex flex-col gap-2 sm:flex-row">
            <Button asChild variant={item.canModify ? "primary" : "secondary"}>
              <Link href={`/ogretmen/odevler/${item.id}`} aria-label={`${item.canModify ? "Düzenle" : "Görüntüle"}: ${item.title}`}>
                <Pencil aria-hidden="true" />
                {item.canModify ? "Düzenle" : "Görüntüle"}
              </Link>
            </Button>
            {hasResults ? (
              <Button asChild variant="secondary">
                <Link href={`/ogretmen/odevler/${item.id}/sonuclar`} aria-label={`Sonuçlar: ${item.title}`}>
                  <BarChart3 aria-hidden="true" />
                  Sonuçlar
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

export function AssignmentsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const me = useMe();
  const isMudur = me.data?.role === "mudur";
  const mineId = useId();
  const filters = useMemo(() => parseAssignmentFilters(new URLSearchParams(params.toString())), [params]);
  const effectiveLesson = isMudur ? filters.lessonId : undefined;
  const lessons = useQuery({ ...lessonsQuery(api()), enabled: isMudur });
  const today = todayInIstanbul();
  const list = useQuery({
    ...manageAssignmentsQuery(api(), { status: filters.tab, lessonId: effectiveLesson, mine: filters.mine, page: filters.page, pageSize: PAGE_SIZE }),
    enabled: me.isSuccess,
  });

  function update(next: Partial<AssignmentFilters>, mode: "push" | "replace" = "push") {
    const merged: AssignmentFilters = { ...filters, page: 1, ...next };
    const target = `${pathname}${assignmentFiltersToSearch(merged)}`;
    if (mode === "replace") router.replace(target);
    else router.push(target);
  }

  const clampTo = list.data ? lastValidPage(list.data.page, list.data.pageSize, list.data.totalCount, list.data.items.length) : null;
  useEffect(() => {
    if (clampTo !== null) update({ page: clampTo }, "replace");
  }, [clampTo]);

  const data = list.data;
  const slice = data ? pageSlice(data.page, data.pageSize, data.totalCount, data.items.length) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Ödev Yönetimi</h1>
          <p className="text-muted-foreground">Ödev oluşturun, soru ekleyin, yayınlayın ve öğrencilerin katılımını izleyin.</p>
        </div>
        <Button asChild>
          <Link href="/ogretmen/odevler/yeni">
            <Plus aria-hidden="true" />
            Yeni Ödev
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_16rem] md:items-end">
        <div role="group" aria-label="Ödev durumu" className="flex flex-wrap gap-2">
          {ASSIGNMENT_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={filters.tab === tab.value}
              onClick={() => update({ tab: tab.value })}
              className={cn(
                "inline-flex min-h-touch items-center rounded-pill border px-4 text-sm font-semibold transition-colors",
                filters.tab === tab.value ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {isMudur ? (
          <SelectField label="Ders" value={filters.lessonId ?? ""} onChange={(event) => update({ lessonId: event.target.value ? Number(event.target.value) : undefined })}>
            <option value="">Tüm Dersler</option>
            {(lessons.data ?? []).map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.name}
              </option>
            ))}
          </SelectField>
        ) : null}
      </div>

      <label htmlFor={mineId} className="inline-flex min-h-touch items-center gap-3 self-start text-sm font-semibold">
        <input id={mineId} type="checkbox" className="size-5 accent-primary" checked={filters.mine} onChange={(event) => update({ mine: event.target.checked })} />
        Yalnızca Benim Ödevlerim
      </label>

      {me.isPending || list.isPending ? (
        <div role="status" aria-label="Ödevler yükleniyor" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-60 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState icon={CloudOff} as="h2" title="Ödevler Yüklenemedi" description={list.error.message} action={<Button onClick={() => list.refetch()}>Tekrar Dene</Button>} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          as="h2"
          title={`${stateLabel(filters.tab)} Ödev Yok`}
          description={filters.tab === "draft" ? "Yeni bir ödev oluşturduğunuzda taslak olarak burada görünür." : "Bu durumda listelenecek ödev bulunmuyor."}
          action={
            <Button asChild>
              <Link href="/ogretmen/odevler/yeni">Yeni Ödev</Link>
            </Button>
          }
        />
      ) : data ? (
        <>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Ödev listesi">
            {data.items.map((item) => (
              <AssignmentCard key={item.id} item={item} today={today} meId={me.data?.id} />
            ))}
          </ul>
          {slice ? <Pagination slice={slice} onPageChange={(page) => update({ page })} /> : null}
        </>
      ) : null}
    </div>
  );
}
