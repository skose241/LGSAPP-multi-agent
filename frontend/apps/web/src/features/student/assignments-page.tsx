"use client";

import { formatDateOnly, todayInIstanbul } from "@lgs/api";
import { lessonsQuery, studentAssignmentsQuery, type StudentAssignmentList } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, CloudOff } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { ProgressBar } from "@/components/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { api } from "@/lib/api/client";
import { parseStudentAssignmentFilters, studentAssignmentFiltersToSearch, type StudentAssignmentFilters, type StudentAssignmentTab } from "@/lib/student/assignments";
import { remainingLabel } from "@/lib/teacher/assignments";
import { lastValidPage, pageSlice } from "@/lib/teacher/students";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

const TABS: { value: StudentAssignmentTab; label: string }[] = [
  { value: "open", label: "Açık Ödevler" },
  { value: "closed", label: "Kapanmış Ödevler" },
];

type Item = StudentAssignmentList["items"][number];

function AssignmentCard({ item, today }: { item: Item; today: string }) {
  const closed = item.state === "closed";
  return (
    <li data-testid="assignment-card" data-assignment-id={item.id}>
      <Link
        href={`/odevler/${item.id}`}
        className="flex h-full min-h-touch flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm hover:bg-surface-muted"
      >
        <span className="flex flex-wrap items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-lg font-semibold">{item.title}</span>
            <span className="block text-sm text-muted-foreground">
              {item.lesson.name} · {item.teacherUserName}
            </span>
          </span>
          <Badge tone={closed ? "neutral" : "success"} data-testid="assignment-remaining">
            {remainingLabel(item.state, item.startDate, item.endDate, today)}
          </Badge>
        </span>
        <span className="text-sm text-muted-foreground">
          {formatDateOnly(item.startDate)} – {formatDateOnly(item.endDate)}
        </span>
        <ProgressBar label={`${item.title} ilerlemesi`} value={item.myAnsweredCount} max={item.totalQuestions} tone={item.myAnsweredCount >= item.totalQuestions && item.totalQuestions > 0 ? "success" : "primary"} />
        <span className="text-sm" data-testid="assignment-progress">
          {item.myAnsweredCount} / {item.totalQuestions} soru çözüldü, {item.myCorrectCount} doğru
        </span>
      </Link>
    </li>
  );
}

export function StudentAssignmentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => parseStudentAssignmentFilters(new URLSearchParams(params.toString())), [params]);
  const today = todayInIstanbul();
  const lessons = useQuery(lessonsQuery(api()));
  const list = useQuery(studentAssignmentsQuery(api(), { state: filters.tab, lessonId: filters.lessonId, page: filters.page, pageSize: PAGE_SIZE }));

  function update(next: Partial<StudentAssignmentFilters>, mode: "push" | "replace" = "push") {
    const merged: StudentAssignmentFilters = { ...filters, page: 1, ...next };
    const target = `${pathname}${studentAssignmentFiltersToSearch(merged)}`;
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
      <div>
        <h1 className="text-3xl">Ödevlerim</h1>
        <p className="text-muted-foreground">Öğretmenlerinizin verdiği ödevleri takip edin ve soruları çözün.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_16rem] md:items-end">
        <div role="group" aria-label="Ödev durumu" className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
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
        <SelectField label="Ders" value={filters.lessonId ?? ""} onChange={(event) => update({ lessonId: event.target.value ? Number(event.target.value) : undefined })}>
          <option value="">Tüm Dersler</option>
          {(lessons.data ?? []).map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.name}
            </option>
          ))}
        </SelectField>
      </div>

      {list.isPending ? (
        <div role="status" aria-label="Ödevler yükleniyor" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState icon={CloudOff} as="h2" title="Ödevler Yüklenemedi" description={list.error.message} action={<Button onClick={() => list.refetch()}>Tekrar Dene</Button>} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          as="h2"
          title={filters.tab === "open" ? "Açık Ödeviniz Yok" : "Kapanmış Ödev Yok"}
          description={filters.tab === "open" ? "Öğretmeniniz bir ödev verdiğinde burada görünecek." : "Süresi dolan ödevleriniz burada listelenir."}
        />
      ) : data ? (
        <>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={filters.tab === "open" ? "Açık ödev listesi" : "Kapanmış ödev listesi"}>
            {data.items.map((item) => (
              <AssignmentCard key={item.id} item={item} today={today} />
            ))}
          </ul>
          {slice ? <Pagination slice={slice} onPageChange={(page) => update({ page })} /> : null}
        </>
      ) : null}
    </div>
  );
}
