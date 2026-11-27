"use client";

import { formatDateTimeShort } from "@lgs/api";
import { studentUploadsQuery, teacherKeys, type StudentUploadItem } from "@lgs/api/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudOff, ImageOff, ImagePlus, MessageCircle, MessageSquare } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { MathText } from "@/components/math-text";
import { Pagination } from "@/components/pagination";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { pageSlice } from "@/lib/teacher/students";

const PAGE_SIZE = 12;

function UploadCard({ item, onImageExpired }: { item: StudentUploadItem; onImageExpired: () => void | Promise<unknown> }) {
  const description = item.description?.trim() ?? "";

  return (
    <Card data-testid="student-upload" className="h-full">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{item.lesson.name}</Badge>
          {item.topic ? <Badge tone="neutral">{item.topic.name}</Badge> : null}
          {item.isHidden ? <Badge tone="warning">Gizli</Badge> : null}
          {item.publishedAt ? <Badge tone="success">Yayında</Badge> : <Badge tone="info">Yayınlanmadı</Badge>}
        </div>

        {item.image ? (
          <QuestionImage
            image={item.image}
            alt={`${item.lesson.name} sorusu görseli`}
            variant="full"
            zoomable
            onExpired={onImageExpired}
            className="max-h-96 w-full bg-surface-muted object-contain"
          />
        ) : item.previewText ? (
          <MathText text={item.previewText} compact className="line-clamp-6 max-w-prose overflow-hidden text-base" />
        ) : (
          <span className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-border bg-surface-muted text-muted-foreground">
            <ImageOff className="size-8" aria-hidden="true" />
            <span className="sr-only">Görsel yok</span>
          </span>
        )}

        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-muted-foreground">Takıldığı yer</p>
          {description ? (
            <p className="max-w-prose whitespace-pre-wrap break-words text-sm">{description}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">Açıklama yazılmamış</p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
          <span>
            {formatDateTimeShort(item.createdAt)}
            {item.publishedAt ? ` · Yayın ${formatDateTimeShort(item.publishedAt)}` : ""}
          </span>
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-4" aria-hidden="true" />
              {item.answerCount}
              <span className="sr-only">cevap</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-4" aria-hidden="true" />
              {item.solutionCount}
              <span className="sr-only">çözüm</span>
            </span>
          </span>
        </div>
        <Button asChild variant="secondary">
          <Link href={`/sorular/${item.id}`}>Soruyu Aç</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function StudentUploadsTab({ studentId, page, onPageChange }: { studentId: number; page: number; onPageChange: (page: number) => void }) {
  const queryClient = useQueryClient();
  const uploads = useQuery(studentUploadsQuery(api(), studentId, { page, pageSize: PAGE_SIZE }));

  if (uploads.isPending) {
    return (
      <div role="status" aria-label="Yüklenen sorular yükleniyor" className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-96 animate-pulse rounded-lg bg-surface-muted" />
        ))}
      </div>
    );
  }

  if (uploads.isError) {
    return (
      <EmptyState
        icon={CloudOff}
        as="h2"
        title="Sorular Yüklenemedi"
        description={uploads.error.message}
        action={<Button onClick={() => uploads.refetch()}>Tekrar Dene</Button>}
      />
    );
  }

  const data = uploads.data;
  if (data.items.length === 0) {
    return <EmptyState icon={ImagePlus} as="h2" title="Soru Yüklememiş" description="Bu öğrenci henüz sisteme soru yüklememiş." />;
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: [...teacherKeys.students, "uploads", studentId] });

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-4 md:grid-cols-2" aria-label="Yüklediği sorular" aria-busy={uploads.isPlaceholderData || undefined}>
        {data.items.map((item) => (
          <li key={item.id}>
            <UploadCard item={item} onImageExpired={refresh} />
          </li>
        ))}
      </ul>
      <Pagination slice={pageSlice(data.page, data.pageSize, data.totalCount, data.items.length)} onPageChange={onPageChange} />
    </div>
  );
}
