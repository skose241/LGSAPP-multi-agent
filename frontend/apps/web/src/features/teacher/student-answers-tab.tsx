"use client";

import { formatDateTimeShort, optionToLetter, questionSourceLabel } from "@lgs/api";
import { lessonsQuery, studentAnswersQuery, teacherKeys, type StudentAnswerItem, type StudentAnswersSummary } from "@lgs/api/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, MessageSquareOff, XCircle } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { MathText } from "@/components/math-text";
import { Pagination } from "@/components/pagination";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { api } from "@/lib/api/client";
import { explanationShare } from "@/lib/teacher/student-review";
import { pageSlice } from "@/lib/teacher/students";

const PAGE_SIZE = 20;

function letter(option: number): string {
  return optionToLetter(option) ?? "-";
}

function SummaryStrip({ summary }: { summary: StudentAnswersSummary }) {
  const share = explanationShare(summary.withExplanation, summary.totalAnswers);
  const cells = [
    { label: "Toplam", value: summary.totalAnswers },
    { label: "Açıklamalı", value: summary.withExplanation },
    { label: "Açıklamasız", value: summary.withoutExplanation },
    { label: "Açıklama Oranı", value: share === null ? "-" : `%${share}` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="answers-summary">
      {cells.map((cell) => (
        <Card key={cell.label}>
          <CardContent className="flex flex-col gap-1 p-4 md:p-4">
            <dt className="text-sm text-muted-foreground">{cell.label}</dt>
            <dd className="font-display text-2xl font-bold">{cell.value}</dd>
          </CardContent>
        </Card>
      ))}
    </dl>
  );
}

function ExplanationBlock({ item, onImageExpired }: { item: StudentAnswerItem; onImageExpired: () => void | Promise<unknown> }) {
  const explanation = item.explanation;

  if (!explanation) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning bg-warning-soft p-3 text-warning-soft-foreground">
        <MessageSquareOff className="size-5 shrink-0" aria-hidden="true" />
        <Badge tone="warning">Açıklama yok</Badge>
        <span className="text-sm">Öğrenci bu soru için açıklama yazmamış.</span>
      </div>
    );
  }

  const text = explanation.text?.trim() ?? "";

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">Öğrencinin açıklaması</span>
        {explanation.isDeleted ? <Badge tone="danger">Silinmiş</Badge> : null}
        {explanation.isHidden ? <Badge tone="warning">Gizli</Badge> : null}
      </div>
      {text ? <MathText text={text} className="max-w-prose break-words text-sm" /> : null}
      {explanation.image ? (
        <QuestionImage
          image={explanation.image}
          alt="Öğrencinin açıklama görseli"
          variant="full"
          zoomable
          onExpired={onImageExpired}
          className="max-h-72 w-full object-contain"
        />
      ) : null}
      {!text && !explanation.image ? <p className="text-sm italic text-muted-foreground">Açıklama içeriği boş.</p> : null}
      <p className="text-xs text-muted-foreground">{formatDateTimeShort(explanation.createdAt)}</p>
    </div>
  );
}

function AnswerRow({ item, onImageExpired }: { item: StudentAnswerItem; onImageExpired: () => void | Promise<unknown> }) {
  const { question } = item;

  return (
    <Card data-testid="student-answer">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="sm:w-40 sm:shrink-0">
            {question.image ? (
              <QuestionImage
                image={question.image}
                alt={`${question.lesson.name} sorusu görseli`}
                variant="thumb"
                onExpired={onImageExpired}
                className="max-h-40 w-full object-contain"
              />
            ) : question.previewText ? (
              <MathText text={question.previewText} compact className="line-clamp-4 overflow-hidden text-sm" />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="primary">{question.lesson.name}</Badge>
              {question.topic ? <Badge tone="neutral">{question.topic.name}</Badge> : null}
              <Badge tone={question.source === "ai" ? "info" : question.source === "teacher" ? "accent" : "neutral"}>
                {questionSourceLabel(question.source)}
              </Badge>
              {item.assignment ? <Badge tone="accent">Ödev: {item.assignment.title}</Badge> : null}
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span
                className={
                  item.isCorrect
                    ? "inline-flex items-center gap-1.5 font-semibold text-correct-soft-foreground"
                    : "inline-flex items-center gap-1.5 font-semibold text-wrong-soft-foreground"
                }
              >
                {item.isCorrect ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
                {item.isCorrect ? "Doğru" : "Yanlış"}
              </span>
              <span>
                Seçilen <strong>{letter(item.selectedOption)}</strong> · Doğru <strong>{letter(question.correctOption)}</strong>
              </span>
              <span className="text-muted-foreground">{formatDateTimeShort(item.answeredAt)}</span>
            </p>
          </div>
        </div>
        <ExplanationBlock item={item} onImageExpired={onImageExpired} />
        <Button asChild variant="secondary" className="self-start">
          <Link href={`/sorular/${question.id}`}>Soruyu Aç</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

interface StudentAnswersTabProps {
  studentId: number;
  page: number;
  lessonId: number | undefined;
  onPageChange: (page: number) => void;
  onLessonChange: (lessonId: number | undefined) => void;
}

export function StudentAnswersTab({ studentId, page, lessonId, onPageChange, onLessonChange }: StudentAnswersTabProps) {
  const queryClient = useQueryClient();
  const lessons = useQuery(lessonsQuery(api()));
  const answers = useQuery(studentAnswersQuery(api(), studentId, { lessonId, page, pageSize: PAGE_SIZE }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: [...teacherKeys.students, "answers", studentId] });

  if (answers.isPending) {
    return (
      <div role="status" aria-label="Cevaplar yükleniyor" className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-56 animate-pulse rounded-lg bg-surface-muted" />
        ))}
      </div>
    );
  }

  if (answers.isError) {
    return (
      <EmptyState
        icon={CloudOff}
        as="h2"
        title="Cevaplar Yüklenemedi"
        description={answers.error.message}
        action={<Button onClick={() => answers.refetch()}>Tekrar Dene</Button>}
      />
    );
  }

  const data = answers.data;

  return (
    <div className="flex flex-col gap-4">
      <SummaryStrip summary={data.summary} />
      <div className="max-w-sm">
        <SelectField label="Ders" value={lessonId ?? ""} onChange={(event) => onLessonChange(event.target.value ? Number(event.target.value) : undefined)}>
          <option value="">Tüm Dersler</option>
          {(lessons.data ?? []).map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.name}
            </option>
          ))}
        </SelectField>
      </div>
      {data.items.length === 0 ? (
        <EmptyState
          icon={MessageSquareOff}
          as="h2"
          title={lessonId ? "Bu Derste Cevap Yok" : "Henüz Cevap Yok"}
          description={lessonId ? "Başka bir ders seçmeyi deneyin." : "Bu öğrenci henüz hiçbir soruyu cevaplamamış."}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-4" aria-label="Cevaplar" aria-busy={answers.isPlaceholderData || undefined}>
            {data.items.map((item) => (
              <li key={item.answerId}>
                <AnswerRow item={item} onImageExpired={refresh} />
              </li>
            ))}
          </ul>
          <Pagination slice={pageSlice(data.page, data.pageSize, data.totalCount, data.items.length)} onPageChange={onPageChange} />
        </>
      )}
    </div>
  );
}
