"use client";

import { todayInIstanbul } from "@lgs/api";
import { assignmentKeys, assignmentMutations, lessonsQuery } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMe } from "@/features/auth/use-me";
import { toProblemState } from "@/features/student/comment-node";
import { AssignmentFields } from "@/features/teacher/assignment-fields";
import { NoBranchNotice } from "@/features/teacher/needs-solution-page";
import { api } from "@/lib/api/client";
import { bindServerFormProblem, defaultAssignmentDates, validateAssignmentDates, type AssignmentFormValues } from "@/lib/teacher/assignments";
import { isNoBranch } from "@/lib/teacher/needs-solution";

export function AssignmentCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const lessons = useQuery(lessonsQuery(api()));
  const today = todayInIstanbul();
  const [values, setValues] = useState<AssignmentFormValues>(() => ({ title: "", description: "", ...defaultAssignmentDates(today) }));
  const [lessonChoice, setLessonChoice] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<ProblemState | null>(null);

  const isMudur = me.data?.role === "mudur";
  const branchless = isNoBranch(me.data?.role, me.data?.branchLessonId);
  const branchLessonId = me.data?.branchLessonId ?? null;
  const lessonId = isMudur ? lessonChoice : branchLessonId;
  const lessonMissing = showErrors && lessonId === null;
  const dateErrors = showErrors ? validateAssignmentDates(values, { today }) : {};

  const create = useMutation({
    mutationFn: () =>
      assignmentMutations.create(api(), {
        lessonId: lessonId ?? 0,
        title: values.title.trim() === "" ? null : values.title.trim(),
        description: values.description.trim() === "" ? null : values.description.trim(),
        startDate: values.startDate,
        endDate: values.endDate,
      }),
    onSuccess: async (created) => {
      setError(null);
      toast.success("Ödev taslak olarak oluşturuldu. Şimdi soru ekleyebilirsin.");
      await queryClient.invalidateQueries({ queryKey: assignmentKeys.teacherAll });
      router.replace(`/ogretmen/odevler/${created.id}`);
    },
    onError: (e: unknown) => setError(toProblemState(e)),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    setError(null);
    if (lessonId === null || Object.keys(validateAssignmentDates(values, { today })).length > 0) return;
    create.mutate();
  }

  const back = (
    <Link href="/ogretmen/odevler" className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Ödev yönetimi
    </Link>
  );

  if (branchless) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <NoBranchNotice />
      </div>
    );
  }

  const lessonOptions = (lessons.data ?? []).map((lesson) => ({ id: lesson.id, name: lesson.name }));
  const fieldProblem = error && error.status === 400 ? error.problem : null;
  const serverErrors = fieldProblem ? bindServerFormProblem(fieldProblem, values, today) : null;
  const bannerState = error && (error.status !== 400 || (Object.keys(error.problem.fieldErrors).length === 0 && !serverErrors)) ? error : null;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {back}
      <div>
        <h1 className="text-3xl">Yeni Ödev</h1>
        <p className="text-muted-foreground">Ödev önce taslak olarak kaydedilir. Soruları ekledikten sonra yayınlayabilir ya da ileri bir tarihe planlayabilirsin.</p>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <Card>
          <CardContent className="flex flex-col gap-5">
            <ProblemBanner state={bannerState} conflictAsMessage />
            <AssignmentFields
              values={values}
              onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
              errors={{ ...serverErrors, ...dateErrors }}
              problem={fieldProblem}
              minDate={today}
              lessonField={{
                value: lessonId ?? "",
                onChange: setLessonChoice,
                options: lessonOptions,
                disabled: !isMudur,
                error: lessonMissing ? "Dersi seç." : undefined,
                hint: isMudur ? undefined : "Ödev branş dersine verilir.",
              }}
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button asChild variant="secondary">
                <Link href="/ogretmen/odevler">Vazgeç</Link>
              </Button>
              <Button type="submit" loading={create.isPending} data-testid="assignment-create">
                Taslak olarak oluştur
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
