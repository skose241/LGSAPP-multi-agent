"use client";

import { addDaysToDateOnly, formatDateOnly, isApiError, todayInIstanbul } from "@lgs/api";
import { lessonsQuery, teacherKeys, teacherMutations, topicPlansQuery, type TopicPlanDay, type TopicPlanLesson } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, CloudOff, Pencil, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { useMe } from "@/features/auth/use-me";
import { toProblemState } from "@/features/student/comment-node";
import { NoBranchNotice } from "@/features/teacher/needs-solution-page";
import { api } from "@/lib/api/client";
import { unplannedLessons } from "@/lib/teacher/dashboard";
import { isNoBranch } from "@/lib/teacher/needs-solution";
import {
  highlightsMissing,
  nextWeekStart,
  parseTargetCount,
  parseWeekStart,
  planCellState,
  previousWeekStart,
  shortDateLabel,
  weekdayLabel,
  weekRange,
} from "@/lib/teacher/topic-plan";
import { cn } from "@/lib/utils";

interface Target {
  date: string;
  lesson: TopicPlanLesson;
}

interface RowContext {
  tomorrow: string;
  today: string;
  onEdit: (target: Target, opener: HTMLElement) => void;
  onDelete: (target: Target, opener: HTMLElement) => void;
}

function StatusBadge({ lesson, date, tomorrow }: { lesson: TopicPlanLesson; date: string; tomorrow: string }) {
  const state = planCellState(lesson);
  if (state === "planned") return <Badge tone="success">Planlandı</Badge>;
  if (state === "missing") {
    return highlightsMissing(lesson, date, tomorrow) ? (
      <Badge tone="warning" data-testid="missing-badge">
        Konu seçilmedi
      </Badge>
    ) : (
      <Badge tone="neutral">Konu seçilmedi</Badge>
    );
  }
  if (state === "locked") return <Badge tone="neutral">{lesson.usedAt ? "Kullanıldı" : "Değiştirilemez"}</Badge>;
  return <Badge tone="neutral">Üretim yok</Badge>;
}

function RowActions({ date, lesson, ctx }: { date: string; lesson: TopicPlanLesson; ctx: RowContext }) {
  if (!lesson.canEdit) return null;
  const label = `${lesson.lessonName}, ${shortDateLabel(date)}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant={lesson.topic ? "secondary" : "primary"} onClick={(event) => ctx.onEdit({ date, lesson }, event.currentTarget)} aria-label={`${lesson.topic ? "Konuyu değiştir" : "Konu seç"}: ${label}`} data-testid="plan-edit">
        <Pencil aria-hidden="true" />
        {lesson.topic ? "Değiştir" : "Konu seç"}
      </Button>
      {lesson.topic ? (
        <Button type="button" variant="secondary" onClick={(event) => ctx.onDelete({ date, lesson }, event.currentTarget)} aria-label={`Konuyu sil: ${label}`} data-testid="plan-delete">
          <Trash2 aria-hidden="true" />
          Sil
        </Button>
      ) : null}
    </div>
  );
}

function DayTable({ day, ctx }: { day: TopicPlanDay; ctx: RowContext }) {
  return (
    <Card className="hidden overflow-hidden md:block">
      <table className="w-full table-fixed text-left text-sm" data-testid="plan-table" data-date={day.date}>
        <caption className="bg-surface-muted px-3 py-3 text-left text-base font-semibold">
          {weekdayLabel(day.date)}, {formatDateOnly(day.date)}
          {day.date === ctx.today ? " (bugün)" : day.date === ctx.tomorrow ? " (yarın)" : ""}
        </caption>
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[26%]" />
          <col className="w-[10%]" />
          <col className="w-[16%]" />
          <col className="w-[28%]" />
        </colgroup>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Ders
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Konu
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Hedef
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Durum
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              İşlem
            </th>
          </tr>
        </thead>
        <tbody>
          {day.lessons.map((lesson) => {
            const missing = highlightsMissing(lesson, day.date, ctx.tomorrow);
            return (
              <tr key={lesson.lessonId} className={cn("border-t border-border", missing && "bg-warning-soft")} data-testid="plan-row" data-lesson-id={lesson.lessonId} data-missing={missing || undefined}>
                <th scope="row" className="px-3 py-2 font-semibold">
                  {lesson.lessonName}
                </th>
                <td className="px-3 py-2">{lesson.topic?.name ?? <span className="text-muted-foreground">-</span>}</td>
                <td className="px-3 py-2 text-right">{lesson.targetCount}</td>
                <td className="px-3 py-2">
                  <StatusBadge lesson={lesson} date={day.date} tomorrow={ctx.tomorrow} />
                </td>
                <td className="px-3 py-1">
                  <RowActions date={day.date} lesson={lesson} ctx={ctx} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function DayCards({ day, ctx }: { day: TopicPlanDay; ctx: RowContext }) {
  return (
    <section aria-label={`${weekdayLabel(day.date)} ${formatDateOnly(day.date)}`} className="flex flex-col gap-2 md:hidden" data-date={day.date}>
      <h2 className="text-lg">
        {weekdayLabel(day.date)}, {formatDateOnly(day.date)}
        {day.date === ctx.today ? " (bugün)" : day.date === ctx.tomorrow ? " (yarın)" : ""}
      </h2>
      <ul className="flex flex-col gap-2">
        {day.lessons.map((lesson) => {
          const missing = highlightsMissing(lesson, day.date, ctx.tomorrow);
          return (
            <li
              key={lesson.lessonId}
              className={cn("flex flex-col gap-2 rounded-lg border bg-surface p-3", missing ? "border-warning bg-warning-soft" : "border-border")}
              data-testid="plan-card"
              data-lesson-id={lesson.lessonId}
              data-missing={missing || undefined}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{lesson.lessonName}</span>
                <StatusBadge lesson={lesson} date={day.date} tomorrow={ctx.tomorrow} />
              </div>
              <p className="text-sm">{lesson.topic?.name ?? <span className="text-muted-foreground">Konu seçilmedi</span>}</p>
              <p className="text-xs text-muted-foreground">Hedef: {lesson.targetCount} soru</p>
              <RowActions date={day.date} lesson={lesson} ctx={ctx} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface PlanDialogProps {
  target: Target;
  topics: { id: number; name: string }[];
  isMudur: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onConflict: (error: unknown) => Promise<void>;
  onCloseAutoFocus: (event: Event) => void;
}

function PlanDialog({ target, topics, isMudur, onClose, onSaved, onConflict, onCloseAutoFocus }: PlanDialogProps) {
  const { date, lesson } = target;
  const [topicId, setTopicId] = useState<number | null>(lesson.topic?.id ?? null);
  const [targetText, setTargetText] = useState(lesson.topic ? String(lesson.targetCount) : "");
  const [error, setError] = useState<ProblemState | null>(null);
  const [topicError, setTopicError] = useState<string | undefined>();
  const [targetError, setTargetError] = useState<string | undefined>();

  const save = useMutation({
    mutationFn: (body: { topicId: number; targetCount: number | null }) =>
      teacherMutations.saveTopicPlan(api(), date, lesson.lessonId, { topicId: body.topicId, targetCount: body.targetCount, rowVersion: lesson.rowVersion }),
    onSuccess: async () => {
      toast.success("Konu planı kaydedildi.");
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

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setTopicError(undefined);
    setTargetError(undefined);
    if (topicId === null) {
      setTopicError("Konuyu seç.");
      return;
    }
    let targetCount: number | null = null;
    if (isMudur) {
      const parsed = parseTargetCount(targetText);
      if (!parsed.ok) {
        setTargetError(parsed.message);
        return;
      }
      targetCount = parsed.value;
    }
    save.mutate({ topicId, targetCount });
  }

  return (
    <Dialog open onOpenChange={(open) => (!open && !save.isPending ? onClose() : undefined)}>
      <DialogContent title={`${lesson.lessonName} konusu`} description={`${weekdayLabel(date)}, ${formatDateOnly(date)} için konu seç.`} onCloseAutoFocus={onCloseAutoFocus}>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <ProblemBanner state={error} conflictAsMessage />
          <SelectField label="Konu" required value={topicId ?? ""} error={topicError} disabled={save.isPending} onChange={(event) => setTopicId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Konu seç</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </SelectField>
          {isMudur ? (
            <TextField
              label="Hedef soru sayısı"
              inputMode="numeric"
              value={targetText}
              placeholder={String(lesson.targetCount)}
              error={targetError}
              disabled={save.isPending}
              hint="Boş bırakırsan ders programındaki varsayılan hedef kullanılır."
              onChange={(event) => setTargetText(event.target.value)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Hedef soru sayısı ders programına göre belirlenir: {lesson.targetCount} soru.</p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={save.isPending}>
                Vazgeç
              </Button>
            </DialogClose>
            <Button type="submit" loading={save.isPending} data-testid="plan-save">
              Kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TopicPlanPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const me = useMe();
  const today = todayInIstanbul();
  const tomorrow = addDaysToDateOnly(today, 1);
  const start = useMemo(() => parseWeekStart(params.get("hafta"), today), [params, today]);
  const range = weekRange(start);
  const isMudur = me.data?.role === "mudur";
  const branchless = isNoBranch(me.data?.role, me.data?.branchLessonId);
  const plan = useQuery({ ...topicPlansQuery(api(), range.from, range.to), enabled: me.isSuccess && !branchless });
  const tomorrowPlan = useQuery({ ...topicPlansQuery(api(), tomorrow, tomorrow), enabled: me.isSuccess && !branchless });
  const lessons = useQuery({ ...lessonsQuery(api()), enabled: me.isSuccess && !branchless });
  const [editing, setEditing] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<Target | null>(null);
  const [band, setBand] = useState<ProblemState | null>(null);
  const [deleteError, setDeleteError] = useState<ProblemState | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  function remember(opener: HTMLElement) {
    openerRef.current = opener;
  }

  function restoreFocus(event: Event) {
    event.preventDefault();
    const opener = openerRef.current;
    if (opener && opener.isConnected) opener.focus();
    else headingRef.current?.focus();
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: teacherKeys.topicPlansAll });

  const onConflict = async (error: unknown) => {
    setBand(toProblemState(error));
    await refresh();
  };

  const remove = useMutation({
    mutationFn: (target: Target) => teacherMutations.deleteTopicPlan(api(), target.date, target.lesson.lessonId, target.lesson.rowVersion ?? ""),
    onSuccess: async () => {
      setDeleting(null);
      setDeleteError(null);
      setBand(null);
      toast.success("Konu planı silindi.");
      await refresh();
    },
    onError: async (e: unknown) => {
      if (isApiError(e) && (e.status === 409 || e.status === 404)) {
        setDeleting(null);
        await onConflict(e);
        return;
      }
      setDeleteError(toProblemState(e));
    },
  });

  function goto(week: string | null) {
    if (!week) return;
    router.push(week === today ? pathname : `${pathname}?hafta=${week}`);
  }

  if (branchless) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl">Konu Planı</h1>
        <NoBranchNotice />
      </div>
    );
  }

  const previous = previousWeekStart(start, today);
  const next = nextWeekStart(start, today);
  const missingTomorrow = tomorrowPlan.data ? unplannedLessons(tomorrowPlan.data) : [];
  const ctx: RowContext = {
    today,
    tomorrow,
    onEdit: (target, opener) => {
      remember(opener);
      setBand(null);
      setEditing(target);
    },
    onDelete: (target, opener) => {
      remember(opener);
      setDeleteError(null);
      setDeleting(target);
    },
  };
  const topicsFor = (lessonId: number) => (lessons.data ?? []).find((lesson) => lesson.id === lessonId)?.topics ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl outline-none">
          Konu Planı
        </h1>
        <p className="text-muted-foreground">
          {isMudur ? "Tüm derslerin günlük konularını planla." : "Branş dersin için günlük soru üretim konusunu seç."} Seçilmeyen günlerde konu otomatik belirlenir.
        </p>
      </div>

      {missingTomorrow.length > 0 ? (
        <div role="status" data-testid="tomorrow-missing" className="flex flex-col gap-2 rounded-md border border-warning bg-warning-soft p-4 text-warning-soft-foreground">
          <p className="font-semibold">Yarın ({formatDateOnly(tomorrow)}) için konu seçilmemiş dersler var.</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Konu seçilmemiş dersler">
            {missingTomorrow.map((entry) => (
              <li key={entry.lessonId} className="rounded-pill bg-surface px-2.5 py-0.5 text-xs font-semibold">
                {entry.lessonName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ProblemBanner state={band} conflictAsMessage />

      <nav aria-label="Hafta gezintisi" className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" disabled={previous === null} onClick={() => goto(previous)} data-testid="week-prev">
          <ChevronLeft aria-hidden="true" />
          Önceki hafta
        </Button>
        <Button type="button" variant="secondary" disabled={start === today} onClick={() => goto(today)} data-testid="week-today">
          Bu hafta
        </Button>
        <Button type="button" variant="secondary" disabled={next === null} onClick={() => goto(next)} data-testid="week-next">
          Sonraki hafta
          <ChevronRight aria-hidden="true" />
        </Button>
        <p className="text-sm text-muted-foreground" data-testid="week-range">
          {formatDateOnly(range.from)} – {formatDateOnly(range.to)}
        </p>
      </nav>

      {plan.isPending || me.isPending ? (
        <div role="status" aria-label="Konu planı yükleniyor" className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : plan.isError ? (
        <EmptyState icon={CloudOff} as="h2" title="Konu planı yüklenemedi" description={plan.error.message} action={<Button onClick={() => plan.refetch()}>Tekrar Dene</Button>} />
      ) : plan.data.days.length === 0 ? (
        <EmptyState icon={CalendarClock} as="h2" title="Plan bulunamadı" description="Bu hafta için gösterilecek gün yok." />
      ) : (
        <div className="flex flex-col gap-4" data-testid="plan-days">
          {plan.data.days.map((day) => (
            <div key={day.date} className="flex flex-col gap-2">
              <DayTable day={day} ctx={ctx} />
              <DayCards day={day} ctx={ctx} />
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <PlanDialog
          key={`${editing.date}-${editing.lesson.lessonId}-${editing.lesson.rowVersion ?? "yeni"}`}
          target={editing}
          topics={topicsFor(editing.lesson.lessonId)}
          isMudur={isMudur}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setBand(null);
            await refresh();
          }}
          onConflict={onConflict}
          onCloseAutoFocus={restoreFocus}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Konu planı silinsin mi?"
        description={deleting ? `${deleting.lesson.lessonName} dersinin ${formatDateOnly(deleting.date)} konusu silinir. O gün konu otomatik belirlenir.` : ""}
        confirmLabel="Planı sil"
        tone="danger"
        pending={remove.isPending}
        error={deleteError}
        conflictAsMessage
        onCloseAutoFocus={restoreFocus}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
      />
    </div>
  );
}
