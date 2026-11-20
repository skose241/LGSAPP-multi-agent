"use client";

import { isApiError, type ParsedProblem } from "@lgs/api";
import { adminKeys, adminMutations, generationScheduleQuery, type GenerationSchedule } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CloudOff } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ProblemBanner, useCountdown, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toProblemState } from "@/features/student/comment-node";
import { useBeforeUnload } from "@/features/upload/hooks";
import { api } from "@/lib/api/client";
import {
  MAX_QUESTIONS_PER_CELL,
  SCHEDULE_DAYS,
  buildItems,
  cellKey,
  changedKeys,
  currentValue,
  dayTotal,
  mapServerErrors,
  validateAll,
} from "@/lib/admin/generation-schedule";
import { DIRTY_LEAVE_MESSAGE } from "@/lib/upload/leave-guard";
import { cn } from "@/lib/utils";

interface CellProps {
  idPrefix: string;
  day: number;
  dayName: string;
  lessonId: number;
  lessonName: string;
  value: string;
  error: string | undefined;
  changed: boolean;
  disabled: boolean;
  onChange: (key: string, value: string) => void;
  visibleLabel: boolean;
}

function Cell({ idPrefix, day, dayName, lessonId, lessonName, value, error, changed, disabled, onChange, visibleLabel }: CellProps) {
  const key = cellKey(day, lessonId);
  const id = `${idPrefix}-${key}`;
  return (
    <>
      <label htmlFor={id} className={visibleLabel ? "text-sm font-semibold" : "sr-only"}>
        <span className="sr-only">{dayName} </span>
        {lessonName}
        <span className="sr-only"> soru adedi</span>
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        data-testid="schedule-cell"
        data-day={day}
        data-lesson={lessonId}
        data-changed={changed ? "true" : undefined}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `cell-error-${key}` : undefined}
        onChange={(event) => onChange(key, event.target.value)}
        className={cn(
          "block h-11 w-16 rounded-md border border-border-strong bg-surface px-2 text-center text-base text-foreground hover:border-neutral-600 focus-visible:border-primary aria-invalid:border-danger aria-invalid:bg-danger-soft",
          changed && !error && "border-primary bg-primary-soft",
        )}
      />
    </>
  );
}

function ScheduleEditor({ schedule }: { schedule: GenerationSchedule }) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<ProblemState | null>(null);
  const [openDays, setOpenDays] = useState<number[]>([1]);
  const countdown = useCountdown(serverError?.status === 429 ? serverError.problem.retryAfter : null, serverError?.at);

  const changed = changedKeys(schedule, edited);
  const changedSet = new Set(changed);
  const dirty = changed.length > 0;
  useBeforeUnload(dirty, DIRTY_LEAVE_MESSAGE);

  const errors: Record<string, string> = { ...serverErrors, ...clientErrors };
  const lessonName = (id: number) => schedule.lessons.find((lesson) => lesson.id === id)?.name ?? "";
  const errorEntries = SCHEDULE_DAYS.flatMap(({ day, name }) =>
    schedule.lessons.flatMap((lesson) => {
      const key = cellKey(day, lesson.id);
      const message = errors[key];
      return message ? [{ key, text: `${name} – ${lesson.name}: ${message}` }] : [];
    }),
  );

  const mutation = useMutation({
    mutationFn: (built: ReturnType<typeof buildItems>) => adminMutations.replaceGenerationSchedule(api(), built.items),
    onSuccess: (result) => {
      queryClient.setQueryData(adminKeys.generationSchedule(), result);
      setEdited({});
      setClientErrors({});
      setServerErrors({});
      setServerError(null);
      toast.success("Ders programı kaydedildi.");
    },
    onError: (error: unknown, built) => {
      setServerError(toProblemState(error));
      const problem: ParsedProblem | null = isApiError(error) && error.status === 400 ? error.problem : null;
      setServerErrors(mapServerErrors(problem, built.keys));
    },
  });

  function change(key: string, value: string) {
    setEdited((current) => ({ ...current, [key]: value }));
    const drop = (current: Record<string, string>) => {
      if (!(key in current)) return current;
      return Object.fromEntries(Object.entries(current).filter(([name]) => name !== key));
    };
    setClientErrors(drop);
    setServerErrors(drop);
  }

  function focusFirstInvalid() {
    window.setTimeout(() => {
      const inputs = Array.from(formRef.current?.querySelectorAll<HTMLInputElement>('input[aria-invalid="true"]') ?? []);
      inputs.find((input) => input.offsetParent !== null)?.focus();
    }, 50);
  }

  function submit() {
    if (!dirty) return;
    const found = validateAll(schedule, edited);
    setClientErrors(found);
    setServerErrors({});
    if (Object.keys(found).length > 0) {
      focusFirstInvalid();
      return;
    }
    mutation.mutate(buildItems(schedule, edited));
  }

  function reset() {
    setEdited({});
    setClientErrors({});
    setServerErrors({});
    setServerError(null);
  }

  function toggleDay(day: number) {
    setOpenDays((current) => (current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day]));
  }

  const blocked = countdown > 0;
  const banner = errorEntries.length > 0 && serverError?.status === 400 ? null : serverError;

  const cellProps = (idPrefix: string, day: number, dayName: string, lessonId: number, visibleLabel: boolean): CellProps => {
    const key = cellKey(day, lessonId);
    return {
      idPrefix,
      day,
      dayName,
      lessonId,
      lessonName: lessonName(lessonId),
      value: currentValue(schedule, edited, day, lessonId),
      error: errors[key],
      changed: changedSet.has(key),
      disabled: mutation.isPending,
      onChange: change,
      visibleLabel,
    };
  };

  return (
    <form
      ref={formRef}
      noValidate
      aria-label="Ders programı"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <ProblemBanner state={banner} countdown={countdown} />
      {errorEntries.length > 0 ? (
        <div role="alert" data-testid="schedule-errors" className="rounded-md border border-danger bg-danger-soft p-3 text-sm font-medium text-danger-soft-foreground">
          <p>Şu hücreleri düzeltin:</p>
          <ul className="mt-1 list-disc pl-5">
            {errorEntries.map((entry) => (
              <li key={entry.key} id={`cell-error-${entry.key}`}>
                {entry.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="hidden lg:block" data-testid="schedule-table">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Gün ve Derse Göre Günlük Soru Adedi</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-2 text-left font-semibold">
                Ders
              </th>
              {SCHEDULE_DAYS.map(({ day, name }) => (
                <th key={day} scope="col" className="px-2 py-2 text-center font-semibold">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.lessons.map((lesson) => (
              <tr key={lesson.id} className="border-t border-border">
                <th scope="row" className="px-2 py-1.5 text-left font-semibold">
                  {lesson.name}
                </th>
                {SCHEDULE_DAYS.map(({ day, name }) => (
                  <td key={day} className="px-2 py-1.5 text-center">
                    <div className="flex justify-center">
                      <Cell {...cellProps("t", day, name, lesson.id, false)} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong">
              <th scope="row" className="px-2 py-2 text-left font-semibold">
                Günlük Toplam
              </th>
              {SCHEDULE_DAYS.map(({ day }) => (
                <td key={day} className="px-2 py-2 text-center font-semibold" data-testid="day-total" data-day={day}>
                  {dayTotal(schedule, edited, day)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-col gap-2 lg:hidden" data-testid="schedule-accordion">
        {SCHEDULE_DAYS.map(({ day, name }) => {
          const hasError = schedule.lessons.some((lesson) => errors[cellKey(day, lesson.id)]);
          const open = openDays.includes(day) || hasError;
          const panelId = `day-panel-${day}`;
          return (
            <section key={day} className="rounded-md border border-border">
              <h3>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  data-testid="day-toggle"
                  onClick={() => toggleDay(day)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left text-base font-semibold"
                >
                  <span>{name}</span>
                  <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    {dayTotal(schedule, edited, day)} soru
                    <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
                  </span>
                </button>
              </h3>
              <div id={panelId} hidden={!open} className="border-t border-border px-4 py-2">
                <ul className="flex flex-col">
                  {schedule.lessons.map((lesson) => (
                    <li key={lesson.id} className="flex items-center justify-between gap-3 py-1.5">
                      <Cell {...cellProps("m", day, name, lesson.id, true)} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={mutation.isPending} disabled={!dirty || blocked} data-testid="schedule-save">
          {blocked ? `Bekle (${countdown})` : "Kaydet"}
        </Button>
        <Button type="button" variant="ghost" disabled={!dirty || mutation.isPending} onClick={reset}>
          Değişiklikleri Geri Al
        </Button>
        <p className="text-sm text-muted-foreground" role="status">
          {dirty ? `${changed.length} hücre değişti.` : "Değişiklik yok."}
        </p>
      </div>
    </form>
  );
}

export function GenerationSchedulePage() {
  const schedule = useQuery(generationScheduleQuery(api()));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Ders Programı</h1>
          <p className="text-muted-foreground">
            Sayılar, her gün 17.30&apos;daki otomatik üretimde ilgili dersten üretilecek soru adedidir (0 ile {MAX_QUESTIONS_PER_CELL} arası). Hangi konudan üretileceği konu planından gelir.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/ogretmen/konu-plani">Konu Planına Git</Link>
        </Button>
      </div>
      <Card data-testid="schedule-card">
        <CardHeader>
          <CardTitle as="h2">Haftalık Soru Adedi</CardTitle>
        </CardHeader>
        <CardContent>
          {schedule.isPending ? (
            <div role="status" aria-label="Ders programı yükleniyor" className="h-64 animate-pulse rounded-lg bg-surface-muted" />
          ) : schedule.isError ? (
            <EmptyState
              icon={CloudOff}
              as="h3"
              title="Ders Programı Alınamadı"
              description={schedule.error.message}
              action={<Button onClick={() => schedule.refetch()}>Tekrar Dene</Button>}
            />
          ) : schedule.data.lessons.length === 0 ? (
            <EmptyState icon={CloudOff} as="h3" title="Aktif Ders Yok" description="Program oluşturmak için önce aktif bir ders tanımlanmalı." />
          ) : (
            <ScheduleEditor schedule={schedule.data} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
